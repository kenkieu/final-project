require('dotenv/config');
const pg = require('pg');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const express = require('express');
const sgMail = require('@sendgrid/mail');
const errorMiddleware = require('./error-middleware');
const staticMiddleware = require('./static-middleware');
const authorizationMiddleware = require('./authorization-middleware');
const ClientError = require('./client-error');

const db = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const app = express();
app.use(staticMiddleware);

const jsonMiddleware = express.json();

app.use(jsonMiddleware);

app.post('/api/auth/sign-up', (req, res, next) => {
  const { username, password, email } = req.body;
  if (!username || !password || !email) {
    throw new ClientError(400, 'username password, and email are required fields');
  }
  argon2
    .hash(password)
    .then(hashedPassword => {
      const sql = `
        insert into "users" ("username", "hashedPassword", "email")
        values ($1, $2, $3)
        returning "userId", "username", "email"
      `;
      const params = [username, hashedPassword, email];
      return db.query(sql, params);
    })
    .then(result => {
      const [user] = result.rows;
      res.status(201).json(user);
    })
    .catch(err => next(err));
});

app.post('/api/auth/sign-in', (req, res, next) => {
  const { username, password } = req.body;
  if (!username || !password) {
    throw new ClientError(401, 'invalid login');
  }
  const sql = `
    select "userId",
           "hashedPassword"
      from "users"
     where "username" = $1
  `;
  const params = [username];
  db.query(sql, params)
    .then(result => {
      const [user] = result.rows;
      if (!user) {
        throw new ClientError(401, 'invalid login');
      }
      const { userId, hashedPassword } = user;
      return argon2
        .verify(hashedPassword, password)
        .then(isMatching => {
          if (!isMatching) {
            throw new ClientError(401, 'invalid login');
          }
          const payload = { userId, username };
          const token = jwt.sign(payload, process.env.TOKEN_SECRET);
          res.json({ token, user: payload });
        });
    })
    .catch(err => next(err));
});

app.post('/api/posts', authorizationMiddleware, (req, res, next) => {
  const { userId } = req.user;
  const { imageUrl, summary, title, body } = req.body;
  if (!imageUrl || !summary || !title || !body) {
    throw new ClientError(400, 'imageUrl, summary, title and body are required fields');
  }
  const sql = `
    insert into "posts" ("userId", "imageUrl", "summary", "title", "body")
    values ($1, $2, $3, $4, $5)
    returning *
  `;
  const params = [userId, imageUrl, summary, title, body];
  db.query(sql, params)
    .then(result => {
      const [newPost] = result.rows;
      res.status(201).json(newPost);
    })
    .catch(err => next(err));
});

app.get('/api/posts/:postId', (req, res, next) => {
  const postId = Number(req.params.postId);
  if (!postId) {
    throw new ClientError(400, 'postId must be a positive integer');
  }
  const sql = `
    select "p"."postId",
           "u"."userId",
           "p"."imageUrl",
           "p"."summary",
           "p"."title",
           "u"."username",
           "u".email,
           "p"."createdAt",
           "p"."body",
           count("c".*) as "totalComments"
    from "posts" as "p"
    join "users" as "u" using ("userId")
    left join "comments" as "c" using ("postId")
    where "p"."postId" = $1
    group by "p"."postId", "u"."username", "u"."userId", "u".email
  `;

  const params = [postId];

  db.query(sql, params)
    .then(result => {
      if (!result.rows) {
        throw new ClientError(400, `cannot find post with postId ${postId}`);
      }
      res.json(result.rows[0]);
    })
    .catch(err => next(err));
});

app.get('/api/posts', (req, res, next) => {
  const sql = `
    select "postId",
           "imageUrl",
           "summary",
           "title",
           "username",
           "createdAt",
           "body"
    from "posts"
    join "users" using ("userId")
    order by "postId" desc
  `;
  db.query(sql)
    .then(result => res.json(result.rows))
    .catch(err => next(err));
});

app.post('/api/comments', authorizationMiddleware, (req, res, next) => {
  const { userId } = req.user;
  const { postId, content } = req.body;
  if (!postId || !userId || !content) {
    throw new ClientError(400, 'postId, userId, and content are required fields');
  }
  const firstSql = `
    insert into "comments" ("postId", "userId", "content")
    values ($1, $2, $3)
    returning *
  `;
  const secondSql = `
    select "username"
    from "users"
    where "userId" = $1
  `;
  const firstParams = [postId, userId, content];
  const secondParams = [userId];

  db.query(firstSql, firstParams)
    .then(firstResult => {
      return db.query(secondSql, secondParams)
        .then(secondResult => {
          const [commentData] = firstResult.rows;
          const [username] = secondResult.rows;
          const newComment = { ...commentData, ...username };
          res.status(201).json(newComment);
        })
        .catch(err => next(err));
    })
    .catch(err => next(err));
});

app.get('/api/comments/:postId', (req, res, next) => {
  const postId = Number(req.params.postId);
  const sql = `
    select "userId",
           "username",
           "content",
           "createdAt"
    from "comments"
    join "users" using ("userId")
    where "postId" = $1
    order by "createdAt" desc
  `;
  const params = [postId];
  db.query(sql, params)
    .then(result => {
      if (!result.rows) {
        throw new ClientError(400, `cannot find post with postId ${postId}`);
      }
      res.json(result.rows);
    })
    .catch(err => next(err));
});

app.post('/api/likes', authorizationMiddleware, (req, res, next) => {
  const { userId } = req.user;
  const { postId } = req.body;
  if (!postId || !userId) {
    throw new ClientError(400, 'postId and userId are required fields');
  }
  const sql = `
    insert into "likePosts" ("postId", "userId")
    values ($1, $2)
    on conflict do nothing
    returning *
  `;
  const params = [postId, userId];
  db.query(sql, params)
    .then(result => {
      const [newLike] = result.rows;
      res.status(201).json(newLike);
    })
    .catch(err => next(err));
});

// app.get('/api/likes/:postId', authorizationMiddleware, (req, res, next) => {
//   const postId = Number(req.params.postId);
//   const { userId } = req.user;
//   const firstSql = `
//     select count("l".*) as "totalLikes"
//     from "likePosts" as "l"
//     where "postId" = $1
//     `;
//   const secondSql = `
//     select count("l".*) > 0 as "userLiked"
//     from "likePosts" as "l"
//     where "postId" = $1 and "userId" = $2
//   `;
//   const firstParams = [postId];
//   const secondParams = [postId, userId];

//   db.query(firstSql, firstParams)
//     .then(firstResult => {
//       if (!firstResult.rows) {
//         throw new ClientError(400, `cannot find post with postId ${postId}`);
//       }
//       return db.query(secondSql, secondParams)
//         .then(secondResult => {
//           if (!secondResult.rows) {
//             throw new ClientError(400, `cannot find post with postId ${postId}`);
//           }
//           console.log('secondResult.rows:', secondResult.rows);
//           const [totalLikes] = firstResult.rows;
//           const [userLiked] = secondResult.rows;
//           const likeData = { ...totalLikes, ...userLiked };
//           res.json(likeData);
//         })
//         .catch(err => next(err));
//     }).catch(err => next(err));
// });

app.get('/api/likes/:postId', (req, res, next) => {
  const postId = Number(req.params.postId);
  const firstSql = `
    select count("l".*) as "totalLikes"
    from "likePosts" as "l"
    where "postId" = $1
    `;

  const firstParams = [postId];

  db.query(firstSql, firstParams)
    .then(firstResult => {
      if (!firstResult.rows) {
        throw new ClientError(400, `cannot find post with postId ${postId}`);
      }
      const [totalLikes] = firstResult.rows;
      res.json(totalLikes);
    })
    .catch(err => next(err));
});

app.get('/api/liked/:postId', authorizationMiddleware, (req, res, next) => {
  const postId = Number(req.params.postId);
  const { userId } = req.user;

  const secondSql = `
    select count("l".*) > 0 as "userLiked"
    from "likePosts" as "l"
    where "postId" = $1 and "userId" = $2
  `;

  const secondParams = [postId, userId];

  db.query(secondSql, secondParams)
    .then(secondResult => {
      if (!secondResult.rows) {
        throw new ClientError(400, `cannot find post with postId ${postId}`);
      }
      const [userLiked] = secondResult.rows;
      res.json(userLiked);
    })
    .catch(err => next(err));
});

app.delete('/api/likes/:postId', authorizationMiddleware, (req, res, next) => {
  const { userId } = req.user;
  const postId = Number(req.params.postId);
  const sql = `
    delete from "likePosts"
    where "postId" = $1 and "userId" = $2
    returning *
  `;
  const params = [postId, userId];

  db.query(sql, params)
    .then(result => {
      res.status(204).json(result.rows);
    })
    .catch(err => next(err));
});

app.post('/api/email-share', (req, res, next) => {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  const { title, summary, body, email } = req.body;
  const msg = {
    to: email,
    from: process.env.SENDER_EMAIL,
    subject: title,
    text: body,
    html: `
      <strong>${title}</strong>
      <br><br>
      <em>${summary}</em>
      <br>
      <p>${body}</p>
      <p>&copy;bloglab</p>
    `
  };
  sgMail.send(msg)
    .then(res => res.json({ success: true }))
    .catch(err => next(err));
});

app.use(errorMiddleware);

app.listen(process.env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`express server listening on port ${process.env.PORT}`);
});
