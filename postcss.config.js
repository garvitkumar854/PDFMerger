module.exports = {
  plugins: {
    'postcss-import': {},
    'postcss-nested': {},
    'tailwindcss': {},
    'postcss-preset-env': {
      features: {
        'nesting-rules': false
      }
    },
    'autoprefixer': {},
    ...(process.env.NODE_ENV === 'production'
      ? {
          'cssnano': {
            preset: ['advanced', {
              discardComments: { removeAll: true },
              colormin: false
            }]
          }
        }
      : {})
  }
};
