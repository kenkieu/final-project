import React from 'react';

class Form extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      userId: null,
      imageUrl: '',
      summary: '',
      title: '',
      body: ''
    };
    this.handleChange = this.handleChange.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
  }

  render() {
    return (
      <>
        <div className="container form">
          <div className="row">
            <div className="col s12 l12 mt-half-rem">
              <h1 className="m-0">Create Blog</h1>
            </div>
          </div>
          <form onSubmit={this.handleSubmit} className="mt-two-rem">
            <div className="row">
              <div className="col s12 l6">
                <img
                  className="width-100"
                  src={
                    !this.state.imageUrl
                      ? 'images/placeholder.png'
                      : this.state.imageUrl
                  }
                  alt="image"
                />
              </div>
              <div className="input-field col s12 l6 mb-two-rem">
                <input
                  required
                  onChange={this.handleChange}
                  id="image-url"
                  type="text"
                  name="imageUrl"
                />
                <label htmlFor="image-url">Image Address</label>
              </div>
              <div className="input-field col s12 l6 mb-two-rem">
                <input
                  required
                  onChange={this.handleChange}
                  id="title"
                  type="text"
                  name="title"
                />
                <label htmlFor="title">Title</label>
              </div>
              <div className="input-field col s12 l6 mb-two-rem">
                <input
                  required
                  onChange={this.handleChange}
                  id="summary"
                  type="text"
                  name="summary"
                />
                <label htmlFor="summary">Summary</label>
              </div>
              <div className="row">
                <div className="input-field col s12 l12 mb-two-rem">
                  <textarea
                    required
                    onChange={this.handleChange}
                    id="body"
                    name="body"
                    className="materialize-textarea"
                  ></textarea>
                  <label htmlFor="body">Body</label>
                </div>
              </div>
              <div className="row flex-end">
                <div className="col">
                  <a
                    href="#"
                    className="btn teal waves-effect waves-light grey darken-2"
                  >
                    Cancel
                    <i className="material-icons right">cancel</i>
                  </a>
                </div>
                <div className="col">
                  <button
                    className="btn teal waves-effect waves-light"
                    type="submit"
                  >
                    Submit
                    <i className="material-icons right">send</i>
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      </>
    );
  }

  componentDidMount() {
    this.setState({ userId: this.props.userId });
  }

  handleChange(event) {
    const value = event.target.value;
    this.setState({ [event.target.name]: value });
  }

  handleSubmit() {
    event.preventDefault();
    const jwt = localStorage.getItem('jwt-token');
    const newPost = this.state;
    const req = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-access-token': jwt
      },
      body: JSON.stringify(newPost)
    };
    fetch('/api/posts', req)
      .then(res => res.json())
      .then(data => {
        window.location.hash = `post?postId=${data.postId}`;
      })
      .catch(err => console.error(err));
  }
}

export default Form;
