import argparse

def main():
    parser = argparse.ArgumentParser(description="Generated CLI Tool")
    sub = parser.add_subparsers(dest="command")

    hello = sub.add_parser("hello")
    hello.add_argument("--name", default="World")

    add = sub.add_parser("add")
    add.add_argument("a", type=float)
    add.add_argument("b", type=float)

    args = parser.parse_args()

    if args.command == "hello":
        print(f"Hello, {args.name}!")
    elif args.command == "add":
        print(args.a + args.b)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
