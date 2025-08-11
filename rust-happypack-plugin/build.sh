#!/bin/bash


set -e

echo "🔌 Building rust-happypack-plugin..."

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

if ! command -v node &> /dev/null; then
    print_error "Node.js not found. Please install Node.js: https://nodejs.org/"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    print_error "npm not found. Please install npm"
    exit 1
fi

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR"

if [ "$1" = "clean" ]; then
    print_status "Cleaning previous builds..."
    rm -rf dist/
    rm -rf node_modules/
fi

print_status "Installing dependencies..."
npm install

print_status "Running linter..."
npm run lint || print_error "Linting failed (continuing anyway)"

print_status "Building TypeScript..."
npm run build

if [ $? -eq 0 ]; then
    print_status "✅ rust-happypack-plugin built successfully"
    print_status "Output: $SCRIPT_DIR/dist/"
else
    print_error "❌ Failed to build rust-happypack-plugin"
    exit 1
fi

if [ "$2" = "test" ]; then
    print_status "Running tests..."
    npm test
fi

print_status "🎉 Build completed!"
