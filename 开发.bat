@echo off
chcp 65001 >nul
title BinaryOrbit 开发模式
cd /d "%~dp0"

if not exist ".env" (
  echo [提示] 还没有 .env，请先复制 .env.example 并填写三个高德 Key。
)

start "BinaryOrbit 后端" cmd /k node --watch server\index.ts
start "BinaryOrbit 前端" cmd /k npm run dev:web

echo 已分别打开后端子窗口（8787）与前端窗口（5173）。
echo 开发时请访问 http://localhost:5173
timeout /t 3 >nul
