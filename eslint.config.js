import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default [
	{ ignores: ['dist/**'] },
	js.configs.recommended,
	{
		files: ['**/*.{js,jsx}'],
		languageOptions: {
			ecmaVersion: 2022,
			globals: globals.browser,
			parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module' },
		},
		plugins: { 'react-hooks': reactHooks },
		rules: {
			...reactHooks.configs.recommended.rules,
			'no-unused-vars': [
				'error',
				{ varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' },
			],
		},
	},
]
