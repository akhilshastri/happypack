console.log('Hello from Rust HappyPack!');

function greet(name) {
  return `Hello, ${name}! This file was transpiled by Rust HappyPack.`;
}

const message = greet('World');
console.log(message);

const numbers = [1, 2, 3, 4, 5];
const doubled = numbers.map(n => n * 2);
console.log('Doubled numbers:', doubled);

async function fetchData() {
  try {
    const response = await fetch('/api/data');
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching data:', error);
  }
}

export { greet, fetchData };
export default message;
