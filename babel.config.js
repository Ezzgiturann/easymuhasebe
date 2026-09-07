// babel-preset-expo must stay: it reads app.json `experiments.reactCompiler`,
// so React Compiler keeps working. The inline-import plugin lets Drizzle's
// generated .sql migrations be imported as strings.
module.exports = (api) => {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
