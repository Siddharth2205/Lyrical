from flask import Flask, render_template, request, jsonify
import requests
from unidecode import unidecode
from bs4 import BeautifulSoup


# Your Spotify API access token (you need to replace this with your own token)
spotify_token = "BQDyP-FOrDE398A4rDm17yuVfo7kWJgHMOrHVRe87Ktj0gjQ336qiPQo4imSWNmwhjhCeIq6h7GpbCN1M5tSuVAObS1OdmHQeRAEV7GUoJvbS3f1SpuU8WaB2WrhUDHQ5eE9ivKn_7U"
genius_token = "TXRBY0itDtmmDw-lXk_OBGBjfhc8D4y0Cq5gQfRmNTt3WxkGh75YJSbQkRcxhxwB"

# Create Flask app
app = Flask(__name__)

# Step 1: Search for song suggestions using Spotify API
def search_songs(query):
    search_url = "https://api.spotify.com/v1/search"
    params = {
        "q": query,
        "type": "track",
        "limit": 5  # Limit the number of results
    }
    headers = {"Authorization": f"Bearer {spotify_token}"}
    response = requests.get(search_url, params=params, headers=headers)
    
    if response.status_code == 200:
        json_data = response.json()
        songs = [{'name': hit['name'], 'artist': hit['artists'][0]['name']} for hit in json_data['tracks']['items']]
        return songs
    else:
        return []

# Step 2: Search for artist suggestions using Spotify API
def search_artists(query):
    search_url = "https://api.spotify.com/v1/search"
    params = {
        "q": query,
        "type": "artist",
        "limit": 5  # Limit the number of results
    }
    headers = {"Authorization": f"Bearer {spotify_token}"}
    response = requests.get(search_url, params=params, headers=headers)
    
    if response.status_code == 200:
        json_data = response.json()
        artists = [{'name': hit['name']} for hit in json_data['artists']['items']]
        return artists
    else:
        return []

# Step 3: Fetch lyrics using Genius API
def get_lyrics_from_genius(song_name, artist_name):
    search_url = "https://api.genius.com/search"
    params = {"q": f"{song_name} {artist_name}"}
    headers = {"Authorization": f"Bearer {genius_token}"}
    response = requests.get(search_url, params=params, headers=headers)
    
    if response.status_code == 200:
        json_data = response.json()
        if json_data['response']['hits']:
            song_url = json_data['response']['hits'][0]['result']['url']
            return song_url
        else:
            return None
    else:
        return None

# Step 4: Scrape the lyrics from Genius
def scrape_lyrics(lyrics_url):
    response = requests.get(lyrics_url)
    
    if response.status_code == 200:
        soup = BeautifulSoup(response.text, 'html.parser')
        lyrics_divs = soup.find_all('div', class_='Lyrics__Container-sc-926d9e10-1 fEHzCI')
        
        if lyrics_divs:
            full_lyrics = "\n".join([div.get_text(separator="\n") for div in lyrics_divs])
            return full_lyrics.strip()
        else:
            return "Lyrics not found on Genius page."
    else:
        return f"Error scraping Genius page: {response.status_code}"

# Step 5: Transliterate the lyrics using unidecode
def transliterate_lyrics(lyrics):
    transliterated_lyrics = unidecode(lyrics)  # Use unidecode to transliterate to ASCII characters
    return transliterated_lyrics

# Step 6: Fetch and transliterate lyrics based on song name and artist
def fetch_and_transliterate_lyrics(song_name, artist_name):
    lyrics_url = get_lyrics_from_genius(song_name, artist_name)
    
    if lyrics_url:
        lyrics = scrape_lyrics(lyrics_url)
    else:
        lyrics = "Lyrics not found."
    
    # Transliterate the lyrics to English
    transliterated_lyrics = transliterate_lyrics(lyrics)
    return transliterated_lyrics

@app.route('/', methods=['GET', 'POST'])
def index():
    lyrics = ""
    if request.method == 'POST':
        song_name = request.form['song_name']
        artist_name = request.form['artist_name']
        lyrics = fetch_and_transliterate_lyrics(song_name, artist_name)
    
    return render_template('index.html', lyrics=lyrics)

@app.route('/search_songs')
def search_songs_route():
    query = request.args.get('q')
    songs = search_songs(query)
    return jsonify({'suggestions': songs})

@app.route('/search_artists')
def search_artists_route():
    query = request.args.get('q')
    artists = search_artists(query)
    return jsonify({'suggestions': artists})

if __name__ == '__main__':
    app.run(debug=True)
