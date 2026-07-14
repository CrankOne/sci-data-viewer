from __future__ import annotations
import argparse
from .app import create_app


def main() -> None:
    parser = argparse.ArgumentParser(
            description="Run the Python 3D viewer server.",
        )

    parser.add_argument( "--host",
            default="127.0.0.1",
        )
    parser.add_argument( "--port",
            type=int,
            default=5000,
        )
    parser.add_argument( "--debug",
            action="store_true",
        )
    parser.add_argument( "--cors",
            action="store_true",
            help="Enable CORS for API routes.",
        )

    args = parser.parse_args()
    app = create_app({
            "DEBUG": args.debug,
            "ENABLE_CORS": args.cors,
        })
    app.run(host=args.host, port=args.port, debug=args.debug)


if __name__ == "__main__":
    main()
