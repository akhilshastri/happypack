interface User {
  id: number;
  name: string;
  email: string;
  isActive: boolean;
}

class UserService {
  private users: User[] = [];

  constructor() {
    console.log('UserService initialized - transpiled by Rust HappyPack!');
  }

  addUser(user: User): void {
    this.users.push(user);
    console.log(`Added user: ${user.name}`);
  }

  getUser(id: number): User | undefined {
    return this.users.find(user => user.id === id);
  }

  getActiveUsers(): User[] {
    return this.users.filter(user => user.isActive);
  }

  async fetchUserFromApi(id: number): Promise<User | null> {
    try {
      const response = await fetch(`/api/users/${id}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const user: User = await response.json();
      return user;
    } catch (error) {
      console.error('Error fetching user:', error);
      return null;
    }
  }
}

function processArray<T>(items: T[], processor: (item: T) => T): T[] {
  return items.map(processor);
}

const userService = new UserService();

const sampleUser: User = {
  id: 1,
  name: 'John Doe',
  email: 'john@example.com',
  isActive: true
};

userService.addUser(sampleUser);

const numbers: number[] = [1, 2, 3, 4, 5];
const doubled = processArray(numbers, n => n * 2);
console.log('Doubled numbers:', doubled);

export { UserService, User };
export default userService;
