import { defineConfig } from 'vitest/config'

// Tests unitaires des moteurs de calcul (logique pure, sans base ni navigateur).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
})
