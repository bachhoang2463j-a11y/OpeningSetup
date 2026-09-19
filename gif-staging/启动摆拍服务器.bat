@echo off
chcp 65001 >nul
title 摆拍服务器 8767 (D:\Project)
echo 摆拍页: http://127.0.0.1:8767/OpeningSetup/gif-staging/staging.html
echo 头像依赖 8766 服务（my_assets）另行启动
python -m http.server 8767 --directory "D:\Project" --bind 127.0.0.1
