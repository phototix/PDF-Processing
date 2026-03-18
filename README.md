# PDF Processing Studio

A lightweight, self-hosted PDF processing web app that runs locally and provides an easy grid-based UI for common PDF tasks: merge, split, rotate, reorder pages, generate thumbnails, and convert between PDFs and images. Built with vanilla HTML/CSS/JS, a small Node.js HTTPS server, and native tools (Ghostscript + ImageMagick).

## ✨ Features

- **Grid view with thumbnails** for PDF browsing
- **Preview PDFs** directly in the browser
- **Merge** multiple PDFs into one
- **Split** a PDF into separate pages
- **Rotate** PDFs (clockwise / counter‑clockwise)
- **Reorder pages** via drag-and-drop
- **PDF ↔ Images** conversion
- **Rename & delete** PDFs
- **Session isolation** for uploaded files

## 🧰 Tech Stack

- **Frontend:** Vanilla JS (`app.js`), HTML (`index.html`), CSS (`styles.css`), Bootstrap, SweetAlert
- **Backend:** Node.js HTTPS server (`server.js`)
- **PDF Ops:** Ghostscript (`gswin64c.exe`), ImageMagick (`magick.exe`), `pdf-lib`
- **PDF Preview:** `pdf.js` (CDN + local fallback in `assets/pdfjs/`)

## 🚀 Getting Started

### Prerequisites

- **Node.js** (LTS recommended)
- **Ghostscript** (`gswin64c.exe`) placed in the project root
- **ImageMagick** (`magick.exe`) placed in the project root
- **HTTPS certificates** in the project root:
  - `localhost.pem`
  - `localhost-key.pem`

> The server runs on **https://localhost:8080**. Make sure your browser trusts the local certificate.

### Install dependencies

```bash
npm install
```

### Run the server

```bash
node server.js
```

Open: **https://localhost:8080**

## 🗂️ Project Structure

```
PDF-Processing/
├─ app.js               # Frontend logic
├─ server.js            # HTTPS API server
├─ index.html           # UI layout
├─ styles.css           # UI styles
├─ assets/              # Icons + local pdf.js bundles
├─ PDF/                 # PDF library + sessions
│  └─ sessions/         # User/session uploads
├─ logs/                # Server logs
└─ specs.md             # Feature/spec notes
```

## 🔌 API Endpoints

All endpoints return JSON `{ ok: boolean, ... }`.

- `GET /api/pdfs?sessionId=...&filter=all|project|library|session|<session-path>`
- `GET /api/sessions`
- `GET /api/images?sessionId=...`
- `POST /api/upload` `{ sessionId, files: [{ name, data(base64) }] }`
- `POST /api/merge` `{ sessionId, files: [relativePath], outputName }`
- `POST /api/split` `{ sessionId, file, prefix }`
- `POST /api/images-to-pdf` `{ sessionId, images: [relativePath], outputName }`
- `POST /api/pdf-to-images` `{ sessionId, file, prefix }`
- `POST /api/thumbnail` `{ file }`
- `POST /api/rotate` `{ file, direction: "cw"|"ccw" }`
- `POST /api/delete` `{ file }`
- `POST /api/rename` `{ file, newName }`
- `POST /api/arrange` `{ file, order: [pageNumbers] }`

## 🧪 Notes & Tips

- **Sessions** are stored under `PDF/sessions/<session-id>` and are generated from the browser (localStorage).
- **Thumbnails** are created with Ghostscript and cached next to PDFs as `*.thumb.png`.
- **Security:** Paths are sanitized and limited to allowed extensions.

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you’d like to change.

## 📄 License

MIT — see `LICENSE`.
