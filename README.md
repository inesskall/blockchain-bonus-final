# Premium Training Spot Auction

Full-stack blockchain project for **Project 2 – Auction of Premium Training Spots**.

The project contains:

- Solidity ERC-721 smart contract
- Auction logic with manual and 24-hour automatic finalization
- React + Vite frontend
- MetaMask wallet connection
- Sepolia deployment configuration
- Hardhat tests for the main edge cases

## Project structure

```text
premium-training-auction/
├── contracts/
│   └── TrainingSpotAuction.sol
├── scripts/
│   └── deploy.js
├── test/
│   └── TrainingSpotAuction.test.js
├── frontend/
│   ├── src/
│   │   ├── abi/TrainingSpotAuction.json
│   │   ├── config/contract.json
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── styles.css
│   └── package.json
├── hardhat.config.js
├── package.json
├── .env.example
└── README.md
```

## What was implemented

| Requirement | Implementation |
|---|---|
| ERC-721 NFT for each training spot | `TrainingSpotAuction` extends OpenZeppelin `ERC721` |
| Unique training spots | Each minted spot gets a unique `tokenId` |
| Metadata: coach, date/time, description, location, image | Stored in `TrainingSpot` struct and exposed through getters + `tokenURI()` |
| List auctioned NFTs | `getActiveTrainingSpots()` and frontend card list |
| Show highest bid and highest bidder | Stored on-chain and shown in frontend |
| Users can place higher bids | `placeBid()` requires `msg.value > highestBid` |
| Owner/seller can manually end auction | `endAuction()` allows contract owner or seller only |
| 24-hour auto-close | `finalizeAuction()` works after `lastBidTime + 24 hours` |
| Sold NFT cannot be sold again | `sold = true`, `auctionActive = false`, bids are blocked |
| Transfer NFT only after auction ends | Contract holds NFT until `endAuction()` or `finalizeAuction()` |
| MetaMask integration | Frontend connects wallet and switches to Sepolia |
| Sign out / disconnect | Frontend clears connected account state |
| Edge cases | Covered in smart contract checks and Hardhat tests |

## Requirements before running

Install:

- Node.js 20+
- npm
- MetaMask browser extension
- Sepolia ETH for deployment and bidding
- Sepolia RPC URL from Alchemy, Infura, QuickNode, or another provider

## 1. Install dependencies

From the project root:

```bash
npm install
cd frontend
npm install
cd ..
```

## 2. Configure environment

Create `.env` in the root folder:

```bash
cp .env.example .env
```

Open `.env` and fill it:

```env
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY
PRIVATE_KEY=YOUR_METAMASK_PRIVATE_KEY_WITHOUT_0x
```

Use a test wallet only. Do not use a wallet with real mainnet funds.

## 3. Run tests

```bash
npm test
```

The tests check:

- NFT minting
- metadata storage
- active auction listing
- higher bid validation
- previous bidder refund
- manual auction ending
- NFT transfer to winner
- sold auction bid blocking
- 24-hour auto-finalization
- bid blocking after the 24-hour window

## 4. Deploy to Sepolia

```bash
npm run deploy:sepolia
```

The deploy script will:

1. Deploy `TrainingSpotAuction`
2. Mint 3 example training spot NFTs
3. Copy the ABI into `frontend/src/abi/TrainingSpotAuction.json`
4. Write the deployed contract address into `frontend/src/config/contract.json`

After successful deployment, you should see something like:

```text
TrainingSpotAuction deployed to: 0x...
Frontend ABI and contract config updated.
```

## 5. Run frontend

```bash
npm run frontend:dev
```

Open the URL from Vite, usually:

```text
http://localhost:5173
```

## 6. How to use the app

1. Open the frontend.
2. Click **Register / Connect MetaMask**.
3. MetaMask should switch to **Sepolia Test Network**.
4. You will see auctioned training spots.
5. Enter an ETH amount higher than the current highest bid.
6. Click **Place Bid**.
7. If another user outbids you, your old bid becomes available in **Refund available**.
8. Click **Withdraw Refund** to claim your previous bid.
9. The owner/seller can click **End Manually** to close the auction.
10. After 24 hours with no new bid, anyone can click **Auto Finalize 24h**.
11. After the auction ends, the NFT is transferred to the highest bidder and the auction disappears from active listings.
12. The seller can click **Withdraw Proceeds** to claim the winning bid.

## Local Hardhat run option

For local testing without Sepolia:

Terminal 1:

```bash
npm run node
```

Terminal 2:

```bash
npm run deploy:localhost
npm run frontend:dev
```

Then add the Hardhat local network to MetaMask:

```text
Network name: Hardhat Localhost
RPC URL: http://127.0.0.1:8545
Chain ID: 31337
Currency: ETH
```

Import one of the private keys printed by `npm run node` into MetaMask.

## Important behavior

- The seller cannot bid on their own item.
- A new bid must be strictly higher than the current highest bid.
- Previous highest bidders withdraw refunds manually through `withdrawRefund()`.
- Seller proceeds are withdrawn manually through `withdrawSellerProceeds()`.
- Auto-close starts after the first bid, because the rule is based on no new bid after the latest bid.
- On Sepolia, you cannot fast-forward time. For the 24-hour auto-close demo, either wait 24 hours or use the Hardhat test/local network.

## Possible improvements

These are optional and not required by the assignment:

- Add NFT image upload through nft.storage or Pinata.
- Add admin form in the frontend for minting new training spots.
- Add auction history page with sold NFTs.
- Add countdown timer until auto-finalization.
- Add Etherscan link for each transaction.
