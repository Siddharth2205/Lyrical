# 🎵 Lyrixa

> A lyrics discovery web app — find and explore song lyrics instantly, deployed on Vercel.

![Live](https://img.shields.io/badge/Live-lyrical--kqii.vercel.app-brightgreen?style=flat-square)
![Language](https://img.shields.io/badge/Backend-Python-blue?style=flat-square)
![Frontend](https://img.shields.io/badge/Frontend-HTML%20%2F%20CSS%20%2F%20JS-orange?style=flat-square)
![Deployed](https://img.shields.io/badge/Deployed-Vercel-black?style=flat-square)

🌐 **Live Demo:** [lyrical-kqii.vercel.app](https://lyrical-kqii.vercel.app)

---

## 📖 About

**Lyrixa** is a web application that lets users search for and display song lyrics. Built with a Python backend (served via a Node.js/Express bridge), HTML/CSS/JS frontend, and deployed seamlessly on Vercel. It's a clean, fast tool for music lovers who want quick access to song lyrics.

---

## ✨ Features

- 🔍 **Lyrics Search** — Search for any song and get lyrics instantly
- ⚡ **Fast & Lightweight** — Minimal UI with quick response times
- 🌐 **Web-based** — No installation required, works in any browser
- ☁️ **Vercel Deployed** — Always-on, globally distributed via Vercel's CDN

---

## 🗂️ Project Structure

```
Lyrical/
├── api/               # Python API handlers (Vercel serverless functions)
├── public/            # Static assets (images, icons)
├── src/               # Frontend source files
├── templates/         # HTML templates
├── venv/              # Python virtual environment
├── server.js          # Express server entry point
├── package.json       # Node.js dependencies
├── requirements.txt   # Python dependencies
├── vercel.json        # Vercel deployment configuration
└── .env               # Environment variables (API keys)
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js (v16+)
- Python 3.8+
- A lyrics API key (e.g., Genius API)

### Installation

```bash
# Clone the repository
git clone https://github.com/Siddharth2205/Lyrical.git
cd Lyrical

# Install Node dependencies
npm install

# Set up Python virtual environment
python -m venv venv
source venv/bin/activate   # On Windows: venv\Scripts\activate

# Install Python dependencies
pip install -r requirements.txt
```

### Configuration

Create a `.env` file in the root directory:

```env
GENIUS_API_KEY=your_api_key_here
```

### Run Locally

```bash
node server.js
```

Then open your browser at `http://localhost:3000`

---

## ☁️ Deployment

This project is deployed on **Vercel**. To deploy your own instance:

```bash
npm install -g vercel
vercel
```

Vercel will automatically detect the `vercel.json` config and deploy both the Node.js server and Python API functions.

---

## 🛠️ Built With

| Technology | Purpose |
|-----------|---------|
| Python | Backend API logic & lyrics fetching |
| Node.js / Express | Server & routing |
| HTML / CSS / JS | Frontend UI |
| Vercel | Hosting & serverless functions |

---

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you'd like to change.

---

## 📧 Contact

**Siddharth Modi**
📬 [sidinregina@gmail.com](mailto:sidinregina@gmail.com)
🐙 [github.com/Siddharth2205](https://github.com/Siddharth2205)

---

⭐ If you find this project useful, give it a star!
