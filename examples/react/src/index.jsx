import React from 'react';
import ReactDOM from 'react-dom';

const UserCard = ({ user, onEdit }) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [name, setName] = React.useState(user.name);

  const handleSave = () => {
    onEdit({ ...user, name });
    setIsEditing(false);
  };

  return (
    <div className="user-card">
      <h3>User Profile - Transpiled by Rust HappyPack!</h3>
      {isEditing ? (
        <div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter name"
          />
          <button onClick={handleSave}>Save</button>
          <button onClick={() => setIsEditing(false)}>Cancel</button>
        </div>
      ) : (
        <div>
          <p>Name: {user.name}</p>
          <p>Email: {user.email}</p>
          <button onClick={() => setIsEditing(true)}>Edit</button>
        </div>
      )}
    </div>
  );
};

class UserList extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      users: [
        { id: 1, name: 'Alice Johnson', email: 'alice@example.com' },
        { id: 2, name: 'Bob Smith', email: 'bob@example.com' },
        { id: 3, name: 'Carol Davis', email: 'carol@example.com' }
      ]
    };
  }

  handleUserEdit = (updatedUser) => {
    this.setState(prevState => ({
      users: prevState.users.map(user =>
        user.id === updatedUser.id ? updatedUser : user
      )
    }));
  };

  render() {
    return (
      <div className="user-list">
        <h2>User Management System</h2>
        <p>This React app was transpiled using Rust HappyPack!</p>
        {this.state.users.map(user => (
          <UserCard
            key={user.id}
            user={user}
            onEdit={this.handleUserEdit}
          />
        ))}
      </div>
    );
  }
}

const withLoading = (WrappedComponent) => {
  return ({ isLoading, ...props }) => {
    if (isLoading) {
      return <div>Loading...</div>;
    }
    return <WrappedComponent {...props} />;
  };
};

const UserListWithLoading = withLoading(UserList);

const App = () => {
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="app">
      <UserListWithLoading isLoading={isLoading} />
    </div>
  );
};

ReactDOM.render(<App />, document.getElementById('root'));

export { UserCard, UserList, withLoading };
export default App;
