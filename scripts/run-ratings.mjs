import { readFile } from 'node:fs/promises';
import { GitHub } from './github.mjs';
import { ratingEventNumber, syncRatings } from './ratings.mjs';

try {
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const number = ratingEventNumber(process.env.GITHUB_EVENT_NAME, event);
  if (number !== false) {
    const github = new GitHub({ repository: process.env.GITHUB_REPOSITORY, token: process.env.GITHUB_TOKEN, branch: event.repository.default_branch });
    console.log(JSON.stringify(await syncRatings({ github, number })));
  }
} catch (error) {
  console.error(error.message); process.exitCode = 1;
}
