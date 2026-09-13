#!/bin/sh
# 로컬 미리보기. 실제 아이폰 테스트는 GitHub Pages(HTTPS)에서 한다 —
# 서비스 워커는 HTTPS 아니면 등록되지 않는다.
exec python3 -m http.server 8080 --bind 127.0.0.1
