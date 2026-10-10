import argparse
import time
from .config import Settings
from .database import Base, database
from .jobs import run_once

def main():
    parser = argparse.ArgumentParser(description='Process durable mock lesson-preparation jobs.')
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    engine, factory = database(Settings.from_env().database_url)
    Base.metadata.create_all(engine)
    try:
        while True:
            worked = run_once(factory)
            if args.once:
                print('Processed a demo job.' if worked else 'No job available.')
                return
            if not worked:
                time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        engine.dispose()

if __name__ == '__main__':
    main()
