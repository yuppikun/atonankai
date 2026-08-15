#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")"

LOG="overnight.log"
DONE_MARKER="DONE_MARKER.txt"
BLOCKED_MARKER="BLOCKED.md"
PROMPT_FILE="RESUME_PROMPT.md"

MAX_ATTEMPTS=24
SLEEP_SECONDS=1200

echo "=== 夜間実行 開始: $(date) ===" >> "$LOG"

if [ ! -f "$PROMPT_FILE" ]; then
  echo "エラー: $PROMPT_FILE が見つかりません。" >> "$LOG"
  exit 1
fi

attempt=1
while [ $attempt -le $MAX_ATTEMPTS ]; do

  if [ -f "$DONE_MARKER" ]; then
    echo "DONE_MARKER.txt を検出。終了します。$(date)" >> "$LOG"
    break
  fi

  echo "--- 試行 $attempt / $MAX_ATTEMPTS : $(date) ---" >> "$LOG"

  claude --dangerously-skip-permissions -p "$(cat "$PROMPT_FILE")" >> "$LOG" 2>&1
  status=$?

  echo "claude 終了コード: $status  ($(date))" >> "$LOG"

  if [ -f "$DONE_MARKER" ]; then
    echo "完了マーカーを検出しました。終了します。$(date)" >> "$LOG"
    break
  fi

  if [ -f "$BLOCKED_MARKER" ]; then
    echo "BLOCKED.md が作成されました。実行を止めます。$(date)" >> "$LOG"
    break
  fi

  echo "${SLEEP_SECONDS}秒待って再試行します。$(date)" >> "$LOG"
  sleep $SLEEP_SECONDS
  attempt=$((attempt+1))
done

if [ ! -f "$DONE_MARKER" ] && [ ! -f "$BLOCKED_MARKER" ]; then
  echo "規定回数（${MAX_ATTEMPTS}回）を試みましたが完了しませんでした。$(date)" >> "$LOG"
fi

echo "=== 夜間実行 終了: $(date) ===" >> "$LOG"
