@echo off
title PDF Tools - by Brandon Chong
cd /d "%~dp0"
setlocal enabledelayedexpansion

:MENU
cls
echo ================================================
echo          PDF Tools - Ghostscript Utility
echo ================================================
echo 1) Merge PDFs
echo 2) Split PDF into pages
echo 3) Render PDF pages to images (JPEG/PNG)
echo 4) Exit
echo ================================================
set /p choice="Select an option (1-4): "

if "%choice%"=="1" goto MERGE
if "%choice%"=="2" goto SPLIT
if "%choice%"=="3" goto RENDER
if "%choice%"=="4" exit /b 0
echo Invalid option! Try again.
pause
goto MENU

::---------------------------------------------------
:MERGE
cls
echo ==== Merge PDFs ====
set /p OUTPUT="Enter output PDF name (default: merged): "
if "%OUTPUT%"=="" set "OUTPUT=merged"
set "OUTPUT=%OUTPUT%.pdf"

set "FILELIST="
for /f "delims=" %%F in ('dir /b /on *.pdf') do (
    if /I not "%%F"=="%OUTPUT%" set "FILELIST=!FILELIST! %%F"
)

if "%FILELIST%"=="" (
    echo No PDF files found.
    pause
    goto MENU
)

echo Merging all PDFs into "%OUTPUT%" ...
gswin64c.exe -dBATCH -dNOPAUSE -q ^
  -sDEVICE=pdfwrite ^
  -sOutputFile="%OUTPUT%" ^
  !FILELIST!

if exist "%OUTPUT%" (
    echo Merge completed successfully! Output: "%OUTPUT%"
) else (
    echo Merge failed.
)
pause
goto MENU

::---------------------------------------------------
:SPLIT
cls
echo ==== Split PDF ====
set /p INPUT="Enter PDF file name to split: "
if not exist "%INPUT%" (
    echo File "%INPUT%" not found!
    pause
    goto MENU
)

set /p PREFIX="Enter output file prefix (default: page_): "
if "%PREFIX%"=="" set "PREFIX=page_"

echo Splitting "%INPUT%" into single-page PDFs...
gswin64c.exe -dBATCH -dNOPAUSE -q ^
  -sDEVICE=pdfwrite ^
  -sOutputFile="%PREFIX%%%03d.pdf" ^
  -dSAFER ^
  "%INPUT%"

echo Splitting complete. Files created as "%PREFIX%001.pdf", "%PREFIX%002.pdf", etc.
pause
goto MENU

::---------------------------------------------------
:RENDER
cls
echo ==== Render PDF Pages to Images ====
set /p INPUT="Enter PDF file name to render: "
if not exist "%INPUT%" (
    echo File "%INPUT%" not found!
    pause
    goto MENU
)

set /p FORMAT="Enter image format (jpg/png, default: jpg): "
if "%FORMAT%"=="" set "FORMAT=jpg"

set /p DPI="Enter resolution (DPI, default: 150): "
if "%DPI%"=="" set "DPI=150"

:: Map input format to Ghostscript device
if /I "%FORMAT%"=="jpg" set DEVICE=jpeg
if /I "%FORMAT%"=="png" set DEVICE=png16m

if "%DEVICE%"=="" (
    echo Unsupported format "%FORMAT%". Only jpg or png allowed.
    pause
    goto MENU
)

echo Rendering "%INPUT%" to images...
gswin64c.exe -dBATCH -dNOPAUSE -q ^
  -sDEVICE=%DEVICE% ^
  -r%DPI% ^
  -sOutputFile="page_%%03d.%FORMAT%" ^
  "%INPUT%"

echo Rendering complete! Images saved as page_001.%FORMAT%, page_002.%FORMAT%, etc.
pause
goto MENU