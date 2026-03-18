# PDF Editor over Website
- A browser grid views of PDF files in the project folder.
- Generate thumbnail for user to preview in (Grid)
- Click to preview in the grid PDF browsers
- Split PDF to custom/default prefix
- Merge PDF by selected pdf files
- Render images into PDF file.
- Render PDF into Images file.
- Basic operations: Rename & Delete PDF
(Refer to process-pdf.bat for old batch prompt methods)

## Infra
- uses .bat to trigger commands to "gswin64c.exe" to proccess the PDF files based on user actions
- Included magick.exe for more image process requirements
- HTML + CSS(styles.css) + JS(app.js) + Bootstrap UI + SweetAlert for Prompts Dialogs + Fontawsome
- Use unique ID to seperate session by user uploads files.
- Generate preview image.

## Web Portal
The user will navigate and use the function on https://localhost:8080/