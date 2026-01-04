/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  verbose: false,
  setupFiles: ['<rootDir>/test/jest/setup-env.ts'],
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.test.ts',
    '<rootDir>/api/**/__tests__/**/*.test.ts',
    '<rootDir>/test/jest/**/*.test.ts',
  ],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: '<rootDir>/tsconfig.json',
      },
    ],
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    // 兼容项目里大量 "import xxx from './a.js'" 的写法（TS 源码跑测试时需要去掉 .js）
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/build/'],
};


