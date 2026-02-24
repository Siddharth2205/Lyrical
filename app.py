# app.py
from flask import Flask, request, jsonify, render_template
from dotenv import load_dotenv
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
import syncedlyrics
from groq import Groq
import re
import os
import logging
import time
import traceback

load_dotenv()

# ── Logging setup ────────────────────────────────────────────────────────────
# NEW
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler()
    ]
)
log = logging.getLogger(__name__)

# ── Env var validation ────────────────────────────────────────────────────────
REQUIRED_VARS = ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET", "GROQ_API_KEY"]
missing = [v for v in REQUIRED_VARS if not os.getenv(v)]
if missing:
    log.critical(f"Missing environment variables: {', '.join(missing)} — check your .env file")
    raise SystemExit(1)

log.info("All environment variables loaded ✓")

# ── Client setup ──────────────────────────────────────────────────────────────
try:
    spotify = spotipy.Spotify(
        auth_manager=SpotifyClientCredentials(
            client_id=os.getenv("SPOTIFY_CLIENT_ID"),
            client_secret=os.getenv("SPOTIFY_CLIENT_SECRET")
        ),
        requests_timeout=10
    )
    log.info("Spotify client initialized ✓")
except Exception as e:
    log.critical(f"Spotify init failed: {e}")
    raise SystemExit(1)

try:
    groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    log.info("Groq client initialized ✓")
except Exception as e:
    log.critical(f"Groq init failed: {e}")
    raise SystemExit(1)

app = Flask(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def fetch_lyrics(title: str, artist: str) -> str | None:
    """
    Try multiple search queries to maximise lyrics hit rate.
    syncedlyrics pulls from Musixmatch, NetEase, and LRCLIB.
    """
    queries = [
        f"{title} {artist}",
        f"{title}",
        f"{artist} {title}",
    ]

    for q in queries:
        log.debug(f"Trying lyrics query: '{q}'")
        try:
            lyrics = syncedlyrics.search(q)
            if lyrics:
                log.info(f"Lyrics found with query: '{q}'")
                return lyrics
        except Exception as e:
            log.warning(f"syncedlyrics failed for query '{q}': {e}")
            continue

    return None


def clean_lyrics(lyrics: str) -> str:
    """Strip LRC timestamps and any leftover clutter."""
    # Remove synced timestamps like [00:23.45] or [00:23:45]
    lyrics = re.sub(r'\[\d{1,2}:\d{2}[.:]\d{2}\]', '', lyrics)
    # Remove metadata tags like [ar:Artist] [ti:Title]
    lyrics = re.sub(r'\[[a-z]+:.*?\]', '', lyrics, flags=re.IGNORECASE)
    # Collapse multiple blank lines into one
    lyrics = re.sub(r'\n{3,}', '\n\n', lyrics)
    cleaned = lyrics.strip()
    log.debug(f"clean_lyrics: {len(cleaned)} chars after cleaning")
    return cleaned


def chunk_lyrics(lyrics: str, max_lines: int = 60) -> list[str]:
    """Split lyrics into chunks at section breaks to stay within token limits."""
    sections = re.split(r'(\[.*?\])', lyrics)
    chunks, current = [], ""

    for part in sections:
        if len((current + part).splitlines()) > max_lines:
            if current.strip():
                chunks.append(current.strip())
            current = part
        else:
            current += part

    if current.strip():
        chunks.append(current.strip())

    result = chunks if chunks else [lyrics]
    log.debug(f"chunk_lyrics: split into {len(result)} chunk(s)")
    return result


def transliterate_with_groq(lyrics: str) -> str:
    chunks = chunk_lyrics(lyrics)
    results = []

    for i, chunk in enumerate(chunks):
        log.debug(f"Sending chunk {i+1}/{len(chunks)} to Groq ({len(chunk)} chars)")
        t0 = time.time()

        try:
            response = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a transliteration expert. Your job is to convert song lyrics "
                            "into English phonetics so an English speaker can read and pronounce them. "
                            "Rules: 1) Transliterate non-English words phonetically — do NOT translate. "
                            "2) Leave English words as-is. "
                            "3) Preserve line breaks, section headers like [Verse 1], and structure exactly. "
                            "4) Output ONLY the transliterated lyrics, nothing else."
                        )
                    },
                    {
                        "role": "user",
                        "content": f"Transliterate these lyrics:\n\n{chunk}"
                    }
                ],
                temperature=0.2,
                max_tokens=2048,
            )
            elapsed = round(time.time() - t0, 2)
            content = response.choices[0].message.content
            log.debug(f"Groq chunk {i+1} done in {elapsed}s ({len(content)} chars returned)")
            results.append(content)

        except Exception as e:
            log.error(f"Groq failed on chunk {i+1}: {e}")
            raise RuntimeError(f"Groq transliteration failed: {str(e)}")

    return "\n\n".join(results)


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/health')
def health():
    """Check all services are reachable."""
    status = {}

    # Spotify
    try:
        spotify.search(q="test", type="track", limit=1)
        status['spotify'] = 'ok'
    except Exception as e:
        status['spotify'] = f'error: {str(e)}'

    # syncedlyrics (no auth needed, just confirm import works)
    try:
        _ = syncedlyrics.search
        status['syncedlyrics'] = 'ok'
    except Exception as e:
        status['syncedlyrics'] = f'error: {str(e)}'

    # Groq
    try:
        groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": "ping"}],
            max_tokens=5
        )
        status['groq'] = 'ok'
    except Exception as e:
        status['groq'] = f'error: {str(e)}'

    all_ok = all('ok' in v for v in status.values())
    log.info(f"/health → {status}")
    return jsonify({
        'status': 'healthy' if all_ok else 'degraded',
        'services': status
    }), 200 if all_ok else 500


@app.route('/search', methods=['GET'])
def search():
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({'error': 'No query provided'}), 400

    log.info(f"/search query='{query}'")
    try:
        results = spotify.search(q=query, type='track', limit=5)
        tracks = [
            {
                'id': t['id'],
                'name': t['name'],
                'artist': t['artists'][0]['name'],
                'album_art': t['album']['images'][0]['url'] if t['album']['images'] else None,
            }
            for t in results['tracks']['items']
        ]
        log.info(f"/search returned {len(tracks)} tracks")
        return jsonify(tracks)

    except spotipy.exceptions.SpotifyException as e:
        log.error(f"Spotify search error: {e}")
        return jsonify({'error': 'Spotify search failed. Check your client credentials.'}), 502
    except Exception as e:
        log.error(f"Unexpected search error: {traceback.format_exc()}")
        return jsonify({'error': 'Unexpected error during search.'}), 500


@app.route('/transliterate', methods=['POST'])
def transliterate():
    data = request.json or {}
    track_id = data.get('track_id', '').strip()

    if not track_id:
        return jsonify({'error': 'track_id is required'}), 400

    log.info(f"/transliterate track_id={track_id}")

    # Step 1 — Spotify metadata
    try:
        track = spotify.track(track_id)
        title = track['name']
        artist = track['artists'][0]['name']
        album_art = track['album']['images'][0]['url'] if track['album']['images'] else None
        log.info(f"Spotify: '{title}' by '{artist}'")
    except spotipy.exceptions.SpotifyException as e:
        log.error(f"Spotify track fetch failed: {e}")
        return jsonify({'error': f'Spotify error: {str(e)}'}), 502
    except Exception as e:
        log.error(traceback.format_exc())
        return jsonify({'error': 'Failed to fetch track info from Spotify.'}), 500

    # Step 2 — Fetch lyrics
    try:
        log.info(f"Fetching lyrics for '{title}' by '{artist}'")
        raw_lyrics = fetch_lyrics(title, artist)
        if not raw_lyrics:
            log.warning(f"No lyrics found for '{title}' by '{artist}'")
            return jsonify({
                'error': f'Lyrics not found for "{title}" by {artist}. '
                          'This track may be instrumental or not in our lyrics database.'
            }), 404
        lyrics = clean_lyrics(raw_lyrics)
        log.info(f"Lyrics ready: {len(lyrics)} chars")
    except Exception as e:
        log.error(traceback.format_exc())
        return jsonify({'error': f'Failed to fetch lyrics: {str(e)}'}), 502

    # Step 3 — Groq transliteration
    try:
        log.info("Starting Groq transliteration...")
        t0 = time.time()
        transliterated = transliterate_with_groq(lyrics)
        log.info(f"Transliteration complete in {round(time.time()-t0, 2)}s")
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 502
    except Exception as e:
        log.error(traceback.format_exc())
        return jsonify({'error': 'Transliteration failed. Check your Groq API key.'}), 500

    return jsonify({
        'title': title,
        'artist': artist,
        'album_art': album_art,
        'original': lyrics,
        'transliterated': transliterated
    })


# ── Error handlers ────────────────────────────────────────────────────────────

@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Route not found'}), 404

@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({'error': 'Method not allowed'}), 405

@app.errorhandler(500)
def internal_error(e):
    log.error(f"Unhandled 500: {e}")
    return jsonify({'error': 'Internal server error'}), 500


# ── Run ───────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    log.info("Starting Lyrical server...")
    app.run(debug=True, port=5000)