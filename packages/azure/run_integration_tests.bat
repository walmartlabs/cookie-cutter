docker-compose up -d;
jest --config=../../jest.integration.config.js --rootDir=.
docker-compose down;