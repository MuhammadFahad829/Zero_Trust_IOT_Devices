# Frontend

This is a minimal React app scaffold compatible with `create-react-app` structure.

To finish setup on your machine:

```bash
cd frontend
# install Node.js/npm if needed
npm install
npm start
```

## Tailwind / Dev setup

This project uses Tailwind CSS + PostCSS. After cloning, run the following from `frontend/`:

```bash
# install JS dependencies (includes tailwind, postcss, autoprefixer)
npm install

# start the dev server
npm start
```

Notes:

- `postcss.config.js` and `tailwind.config.js` are already present.
- If you see missing peer warnings, run `npm install` again or upgrade Node/npm.
