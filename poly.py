import requests
from datetime import datetime

API_URL = "https://data-api.polymarket.com/trades"
MIN_SIZE = 1_000  # 1 band

resp = requests.get(API_URL, params={"limit": 1000})
resp.raise_for_status()
trades = resp.json()

big_trades = [t for t in trades if t.get("size", 0) >= MIN_SIZE]

if not big_trades:
    print("no trades > 10k found.")
    exit()

print(f"\n trades >= ${MIN_SIZE:,}\n")

for t in big_trades:
    ts = datetime.fromtimestamp(t["timestamp"]).strftime("%Y-%m-%d %H:%M:%S")
    size = f"${t['size']:,.2f}"
    price = f"{t['price']:.3f}"
    side = t["side"]
    market = t.get("slug", "unknown-market")
    event = t.get("eventSlug", "unknown-event")

    print("─" * 72)
    print(f"Time:   {ts}")
    print(f"Event:  {event}")
    print(f"Market: {market}")
    print(f"Side:   {side}")
    print(f"Size:   {size}")
    print(f"Price:  {price}")

print("\nDone.\n")
