==============================
🚀 Buildout Proxy Server Setup
==============================

This project creates a secure Node.js proxy to serve Buildout listing data to your frontend.

-----------------------
🔧 1. Prerequisites
-----------------------
- Node.js installed: https://nodejs.org/
- GitHub or local folder access

-----------------------
▶️ 2. How to Run Locally
-----------------------
1. Open terminal and navigate to folder:
   cd buildout-proxy

2. Install dependencies:
   npm install

3. Start the proxy:
   node server.js

4. Visit your proxy:
   http://localhost:3000/api/listings

------------------------------
☁️ 3. Deploy to Render (Free)
------------------------------
1. Go to https://render.com
2. Create New Web Service → Select your GitHub repo
3. Use:
   - Environment: Node
   - Build command: npm install
   - Start command: node server.js
   - Port: 3000

4. Once deployed, your endpoint will be:
   https://your-app-name.onrender.com/api/listings

Now your front-end can call this endpoint live!

--------------------------
📞 Need help? Ask ChatGPT
--------------------------