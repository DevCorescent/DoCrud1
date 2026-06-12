import Document, { Head, Html, Main, NextScript } from 'next/document';

// The project primarily uses the App Router (`/app`). However, some build paths
// (and legacy lint rules) still expect a Document entrypoint to exist.
// Keeping this lightweight prevents `/ _document` resolution errors during `next build`.
export default class MyDocument extends Document {
  render() {
    return (
      <Html lang="en">
        <Head />
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

