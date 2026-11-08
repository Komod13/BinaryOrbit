@echo off
chcp 65001 >nul
setlocal
title BinaryOrbit 双星轨道
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto no_node

for /f "delims=" %%v in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 24 goto old_node

if not exist ".env" goto no_env
if not exist "node_modules" goto no_modules

echo 检查前端构建...
node scripts\ensure-build.mjs
if errorlevel 1 goto build_failed

echo 正在启动 BinaryOrbit ...
node server\index.ts
goto end

:no_node
echo.
echo   [错误] 没有找到 Node.js。
echo   请安装 Node 24 LTS（安装时勾选 Add to PATH）：https://nodejs.org/
echo.
pause
exit /b 1

:old_node
echo.
echo   [错误] 当前 Node 主版本是 %NODE_MAJOR%，本项目需要 Node 24 及以上。
echo   node:sqlite 在 22.x 需要实验性参数，因此必须升级到 24 LTS。
echo.
pause
exit /b 1

:no_env
echo.
echo   [错误] 还没有 .env 配置文件。
echo   请复制 .env.example 为 .env，然后填写三个高德 Key。
echo.
pause
exit /b 1

:no_modules
echo.
echo   [错误] 还没有安装依赖。
echo   请在本目录执行一次：npm install
echo.
pause
exit /b 1

:build_failed
echo.
echo   [错误] 前端构建失败，请把上面的报错贴出来。
echo.
pause
exit /b 1

:end
echo.
echo 服务已停止。按任意键关闭窗口。
pause >nul
