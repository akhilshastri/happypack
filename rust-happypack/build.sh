#!/bin/bash


set -e

echo "🦀 Building Rust HappyPack..."

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

if ! command -v cargo &> /dev/null; then
    print_error "Cargo not found. Please install Rust: https://rustup.rs/"
    exit 1
fi

if ! command -v node &> /dev/null; then
    print_error "Node.js not found. Please install Node.js: https://nodejs.org/"
    exit 1
fi

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

print_status "Project root: $PROJECT_ROOT"

BUILD_MODE="${1:-release}"

if [ "$BUILD_MODE" = "debug" ]; then
    CARGO_FLAGS=""
    BUILD_DIR="debug"
else
    CARGO_FLAGS="--release"
    BUILD_DIR="release"
fi

print_status "Building in $BUILD_MODE mode..."

print_status "Building Rust worker binary..."
cd "$SCRIPT_DIR"

if [ "$2" = "clean" ]; then
    print_status "Cleaning previous builds..."
    cargo clean
fi

cargo build $CARGO_FLAGS

if [ $? -eq 0 ]; then
    print_status "✅ Rust worker built successfully"
    WORKER_PATH="$SCRIPT_DIR/target/$BUILD_DIR/rust-happypack-worker"
    print_status "Worker binary: $WORKER_PATH"
    
    chmod +x "$WORKER_PATH"
else
    print_error "❌ Failed to build Rust worker"
    exit 1
fi

print_status "Building Node.js loader..."
cd "$PROJECT_ROOT/rust-happypack-loader"

if [ ! -f "package.json" ]; then
    print_error "package.json not found in rust-happypack-loader directory"
    exit 1
fi

npm install

npm run build

if [ $? -eq 0 ]; then
    print_status "✅ Node.js loader built successfully"
else
    print_error "❌ Failed to build Node.js loader"
    exit 1
fi

print_status "Building Node.js plugin..."
cd "$PROJECT_ROOT/rust-happypack-plugin"

if [ ! -f "package.json" ]; then
    print_error "package.json not found in rust-happypack-plugin directory"
    exit 1
fi

npm install

npm run build

if [ $? -eq 0 ]; then
    print_status "✅ Node.js plugin built successfully"
else
    print_error "❌ Failed to build Node.js plugin"
    exit 1
fi

if [ "$3" = "test" ]; then
    print_status "Running tests..."
    
    cd "$SCRIPT_DIR"
    cargo test
    
    cd "$PROJECT_ROOT/rust-happypack-loader"
    npm test
    
    cd "$PROJECT_ROOT/rust-happypack-plugin"
    npm test
fi

print_status "🎉 Build completed successfully!"
print_status ""
print_status "Usage:"
print_status "  Rust worker: $WORKER_PATH"
print_status "  Node.js loader: $PROJECT_ROOT/rust-happypack-loader"
print_status "  Node.js plugin: $PROJECT_ROOT/rust-happypack-plugin"
print_status ""
print_status "Next steps:"
print_status "  1. See examples/ directory for usage examples"
print_status "  2. Run 'npm test' to verify installation"
print_status "  3. Check README.md for integration guide"
