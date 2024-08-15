# Get Query Automation
Get Query Automation is a tool designed to automate the process of interacting with a specific bot and retrieving queries from a Telegram session. This script was developed by Galkurta and includes features like session creation and query extraction.

## Features
Create Telegram Session: Automatically create a new session for your Telegram bot.
Retrieve Queries: Extract queries from a specific Telegram bot session.
Two-Factor Authentication (2FA): Supports 2FA if your Telegram account uses it.
Customization: Easily customize bot username and URL in the script.
### Prerequisites
Node.js: Make sure you have Node.js installed on your system.
Telegram API ID and Hash: You need a Telegram API ID and Hash which can be obtained by creating a Telegram application at my.telegram.org.
### Installation
- Clone the repository or download the script.
- Navigate to the project directory.
#### Install the necessary dependencies by running:
```
npm install
```
#### Edit .env file in the root of the project and add your Telegram API credentials:
```
nano .env
```
> API_ID=your_telegram_api_id

> API_HASH=your_telegram_api_hash

#### Create session folder
```
mkdir session
```
#### Create data folder
```
mkdir data
```
### Usage
#### Run the script:
```
node main.js
```
You will be prompted to choose an option:

1. Create session: Start the process to create a new Telegram session.
2. Get query from session: Retrieve the latest queries from the specified Telegram bot.

Follow the prompts to enter your phone number and other necessary information.

### Customization Full on Bot Telegram

License
This project is licensed under the MIT License - see the LICENSE file for details.

Acknowledgments
Thanks to Galkurta for developing this automation script.
Inspired by the need to automate interactions with Telegram bots for query retrieval.
This README file provides an overview of the project, instructions for setup and usage, and guidance on how to customize the bot username and URL within the script.
