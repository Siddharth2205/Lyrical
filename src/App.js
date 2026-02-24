import { useState, useRef, useCallback, useEffect } from 'react';
import styles from './App.module.css';

// ── Helpers ───────────────────────────────────────────────────────────────────
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function formatLyrics(text) {
  return text.split('\n').map((line, i) => {
    const isHeader = /^\[.+\]$/.test(line.trim());
    return isHeader
      ? <span key={i} className={styles.sectionHeader}>{line}<br /></span>
      : <span key={i}>{line}<br /></span>;
  });
}

// ── Spotify Web Playback Hook ─────────────────────────────────────────────────
function useSpotifyPlayer(accessToken) {
  const [player, setPlayer]           = useState(null);
  const [deviceId, setDeviceId]       = useState(null);
  const [playerState, setPlayerState] = useState(null);
  const [ready, setReady]             = useState(false);

  useEffect(() => {
    if (!accessToken) return;

    window.onSpotifyWebPlaybackSDKReady = () => {
      const p = new window.Spotify.Player({
        name: 'Lyrixa Player',
        getOAuthToken: cb => cb(accessToken),
        volume: 0.8,
      });

      p.addListener('ready', ({ device_id }) => {
        setDeviceId(device_id);
        setReady(true);
        console.log('Spotify player ready, device:', device_id);
      });
      p.addListener('player_state_changed', state => setPlayerState(state));
      p.addListener('not_ready', () => setReady(false));
      p.addListener('initialization_error', ({ message }) => console.error('Init error:', message));
      p.addListener('authentication_error', ({ message }) => console.error('Auth error:', message));
      p.addListener('account_error',        ({ message }) => console.error('Account error:', message));

      p.connect();
      setPlayer(p);
    };

    if (!document.getElementById('spotify-sdk')) {
      const script = document.createElement('script');
      script.id  = 'spotify-sdk';
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      document.body.appendChild(script);
    } else if (window.Spotify) {
      window.onSpotifyWebPlaybackSDKReady();
    }

    return () => { player?.disconnect(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  return { player, deviceId, playerState, ready };
}

// ── Components ────────────────────────────────────────────────────────────────
function LoadingBars() {
  return (
    <div className={styles.loadingWrap}>
      <div className={styles.bars}>
        {[20, 35, 25, 40, 15, 30, 22].map((h, i) => (
          <span key={i} style={{ height: h, animationDelay: `${i * 0.08}s` }} />
        ))}
      </div>
      <p>Transliterating lyrics…</p>
    </div>
  );
}

function TrackItem({ track, onSelect }) {
  return (
    <div className={styles.trackItem} onClick={() => onSelect(track.id)}>
      {track.album_art
        ? <img src={track.album_art} alt="art" className={styles.trackArt} />
        : <div className={styles.trackArtPlaceholder} />}
      <div className={styles.trackInfo}>
        <div className={styles.trackName}>{track.name}</div>
        <div className={styles.trackArtist}>{track.artist}</div>
      </div>
      <button className={styles.selectBtn}>SELECT</button>
    </div>
  );
}

function LyricsPanel({ label, lyrics }) {
  return (
    <div className={styles.lyricsPanel}>
      <div className={styles.panelLabel}>{label}</div>
      <div className={styles.lyricsText}>{formatLyrics(lyrics)}</div>
    </div>
  );
}

// ── Music Player Component (new UI) ───────────────────────────────────────────
function MusicPlayer({ player, playerState, accessToken, trackId, deviceId, ready, albumArt, title, artist }) {
  const [volume, setVolume]     = useState(0.8);
  const [muted, setMuted]       = useState(false);
  const [position, setPosition] = useState(0);
  const [dragging, setDragging] = useState(false);
  const intervalRef             = useRef(null);

  const isPaused   = playerState?.paused ?? true;
  const duration   = playerState?.duration ?? 0;
  const currentPos = playerState?.position ?? 0;
  const progress   = duration ? (position / duration) * 100 : 0;

  useEffect(() => {
    clearInterval(intervalRef.current);
    if (!isPaused && !dragging) {
      intervalRef.current = setInterval(() => {
        setPosition(p => Math.min(p + 1000, duration));
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [isPaused, duration, dragging]);

  useEffect(() => { if (!dragging) setPosition(currentPos); }, [currentPos, dragging]);

  useEffect(() => {
    if (!trackId || !deviceId || !accessToken || !ready) return;
    fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
      method:  'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: [`spotify:track:${trackId}`] }),
    }).catch(console.error);
  }, [trackId, deviceId, accessToken, ready]);

  function handleSeek(e) {
    const val = Number(e.target.value);
    setPosition(val);
    player?.seek(val);
    setDragging(false);
  }

  function handleVolumeChange(e) {
    const val = Number(e.target.value);
    setVolume(val);
    setMuted(val === 0);
    player?.setVolume(val);
  }

  function toggleMute() {
    const newMuted = !muted;
    setMuted(newMuted);
    player?.setVolume(newMuted ? 0 : volume);
  }

  function togglePlay() { player?.togglePlay(); }
  function skipPrev()   { player?.previousTrack(); }
  function skipNext()   { player?.nextTrack(); }

  if (!ready) {
    return (
      <div className={styles.player}>
        <div className={styles.playerConnecting}>
          <div className={styles.connectingDots}>
            <span /><span /><span />
          </div>
          <span>Connecting to Spotify…</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.player}>
      <div className={styles.playerInner}>

        {/* Album art */}
        <div className={styles.playerArtWrap}>
          {albumArt
            ? <img src={albumArt} alt="album" className={styles.playerArt} />
            : <div className={styles.playerArtPlaceholder} />}
          {!isPaused && <div className={styles.playingRing} />}
        </div>

        {/* Center: info + seek + controls */}
        <div className={styles.playerCenter}>
          <div className={styles.playerTrackInfo}>
            <div className={styles.playerTitle}>{title}</div>
            <div className={styles.playerArtist}>{artist}</div>
          </div>

          <div className={styles.seekWrap}>
            <span className={styles.seekTime}>{formatTime(position)}</span>
            <div className={styles.seekTrack}>
              <div className={styles.seekFill} style={{ width: `${progress}%` }} />
              <input
                type="range"
                className={styles.seekInput}
                min={0}
                max={duration || 1}
                value={position}
                onChange={handleSeek}
                onMouseDown={() => setDragging(true)}
                onTouchStart={() => setDragging(true)}
              />
            </div>
            <span className={styles.seekTime}>{formatTime(duration)}</span>
          </div>

          <div className={styles.playerControls}>
            <button className={styles.skipBtn} onClick={skipPrev} title="Previous">
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
            </button>
            <button className={styles.playBtn} onClick={togglePlay}>
              {isPaused
                ? <svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26"><path d="M8 5v14l11-7z"/></svg>
                : <svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
              }
            </button>
            <button className={styles.skipBtn} onClick={skipNext} title="Next">
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="m6 18 8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
            </button>
          </div>
        </div>

        {/* Volume */}
        <div className={styles.playerVolume}>
          <button className={styles.muteBtn} onClick={toggleMute}>
            {muted || volume === 0
              ? <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z"/></svg>
              : volume < 0.5
              ? <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M18.5 12A4.5 4.5 0 0 0 16 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/></svg>
              : <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
            }
          </button>
          <div className={styles.volTrack}>
            <div className={styles.volFill} style={{ height: `${(muted ? 0 : volume) * 100}%` }} />
            <input
              type="range"
              className={styles.volInput}
              min={0} max={1} step={0.01}
              value={muted ? 0 : volume}
              onChange={handleVolumeChange}
            />
          </div>
        </div>

      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [query, setQuery]             = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showDrop, setShowDrop]       = useState(false);
  const [searching, setSearching]     = useState(false);
  const [loading, setLoading]         = useState(false);
  const [result, setResult]           = useState(null);
  const [error, setError]             = useState(null);
  const [view, setView]               = useState('both');
  const [accessToken, setAccessToken] = useState(null);
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const lastQuery  = useRef('');
  const resultRef  = useRef(null);

  const { player, deviceId, playerState, ready } = useSpotifyPlayer(accessToken);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token  = params.get('access_token');
    if (token) {
      setAccessToken(token);
      window.history.replaceState({}, '', '/');
    }
    const authError = params.get('auth_error');
    if (authError) {
      setError(`Spotify login failed: ${authError}`);
      window.history.replaceState({}, '', '/');
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const doSearch = useCallback(debounce(async (q) => {
    if (!q) { setSuggestions([]); setShowDrop(false); return; }
    if (q === lastQuery.current) return;
    lastQuery.current = q;
    setSearching(true);
    setShowDrop(true);
    try {
      const res  = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setSuggestions(Array.isArray(data) ? data : []);
    } catch {
      setSuggestions([]);
    } finally {
      setSearching(false);
    }
  }, 300), []);

  function handleInput(e) {
    const val = e.target.value;
    setQuery(val);
    if (!val.trim()) { setSuggestions([]); setShowDrop(false); return; }
    doSearch(val.trim());
  }

  async function selectTrack(trackId) {
    setShowDrop(false);
    setLoading(true);
    setResult(null);
    setError(null);
    setSelectedTrackId(trackId);

    try {
      const res  = await fetch('/api/transliterate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ track_id: trackId }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error || 'Something went wrong.'); return; }
      setResult(data);
      setQuery(`${data.title} — ${data.artist}`);
      lastQuery.current = '';
      setView('both');
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch {
      setError('Network error. Check your connection.');
    } finally {
      setLoading(false);
    }
  }

  function handleBlur() {
    setTimeout(() => setShowDrop(false), 150);
  }

  function loginWithSpotify() {
    window.location.href = process.env.REACT_APP_API_URL + '/api/auth/login';
  }

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.logo}>LYRI<span>XA</span></div>
        <div className={styles.headerRight}>
          {accessToken
            ? <div className={styles.loggedIn}>
                <span className={styles.dot} />
                Spotify connected
              </div>
            : <button className={styles.loginBtn} onClick={loginWithSpotify}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                </svg>
                Login with Spotify
              </button>
          }
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.hero}>
          <h1 className={styles.heroTitle}>SING <em>EVERY</em><br />SONG</h1>
          <p className={styles.heroSub}>Search any track, get instant phonetic transliteration, and play it directly.</p>
        </div>

        <div className={styles.searchWrap}>
          <div className={styles.searchBox}>
            <input
              className={styles.searchInput}
              type="text"
              placeholder="Search for a song or artist…"
              value={query}
              onChange={handleInput}
              onFocus={() => suggestions.length && setShowDrop(true)}
              onBlur={handleBlur}
              autoComplete="off"
            />
            {searching && <div className={styles.spinner} />}
          </div>

          {showDrop && (
            <div className={styles.dropdown}>
              {suggestions.length === 0 && !searching && (
                <div className={styles.dropEmpty}>No results found</div>
              )}
              {searching && suggestions.length === 0 && (
                <div className={styles.dropEmpty}>Searching…</div>
              )}
              {suggestions.map(t => (
                <TrackItem key={t.id} track={t} onSelect={selectTrack} />
              ))}
            </div>
          )}
        </div>

        {loading && <LoadingBars />}

        {error && !loading && (
          <div className={styles.errorBox}>
            <div className={styles.errorTitle}>OOPS</div>
            <p>{error}</p>
          </div>
        )}

        {result && !loading && (
          <div className={styles.result} ref={resultRef}>
            <div className={styles.songHeader}>
              {result.album_art && <img src={result.album_art} alt="album" className={styles.albumArt} />}
              <div className={styles.songMeta}>
                <div className={styles.songTitle}>{result.title}</div>
                <div className={styles.songArtist}>{result.artist}</div>
              </div>
            </div>

            {accessToken
              ? <MusicPlayer
                  player={player}
                  playerState={playerState}
                  accessToken={accessToken}
                  trackId={selectedTrackId}
                  deviceId={deviceId}
                  ready={ready}
                  albumArt={result.album_art}
                  title={result.title}
                  artist={result.artist}
                />
              : <div className={styles.playerPrompt}>
                  <button className={styles.loginBtn} onClick={loginWithSpotify}>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                    </svg>
                    Login with Spotify to play
                  </button>
                </div>
            }

            <div className={styles.tabs}>
              {['both', 'original', 'transliterated'].map(v => (
                <button
                  key={v}
                  className={`${styles.tab} ${view === v ? styles.tabActive : ''}`}
                  onClick={() => setView(v)}
                >
                  {v === 'both' ? 'SIDE BY SIDE' : v.toUpperCase()}
                </button>
              ))}
            </div>

            <div className={`${styles.panels} ${view !== 'both' ? styles.panelsSingle : ''}`}>
              {(view === 'both' || view === 'original') && (
                <LyricsPanel label="Original" lyrics={result.original} />
              )}
              {(view === 'both' || view === 'transliterated') && (
                <LyricsPanel label="Transliterated" lyrics={result.transliterated} />
              )}
            </div>
          </div>
        )}
      </main>

      <footer className={styles.footer}>
        Lyrixa — Powered by Groq &amp; LRCLIB — 2025
      </footer>
    </div>
  );
}