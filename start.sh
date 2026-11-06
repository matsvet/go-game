#!/bin/bash
# Запуск веб-тренажера Го с нейросетью KataGo
cd "$(dirname "$0")"

echo "🎮 Запуск тренажера Го с нейросетью KataGo..."
node server.js &
SERVER_PID=$!

# Ждем запуска сервера
sleep 1.5

# Открываем в браузере
open http://localhost:3000

echo ""
echo "========================================================"
echo "  Тренажер Го открыт в браузере: http://localhost:3000"
echo "  Нейросеть KataGo задействует Metal GPU на вашем Mac"
echo "  Для остановки нажмите Ctrl+C"
echo "========================================================"
echo ""

# Ожидание завершения по Ctrl+C
trap "kill $SERVER_PID 2>/dev/null; exit 0" SIGINT SIGTERM
wait $SERVER_PID
