const { expect } = require("chai");
const { ethers, network } = require("hardhat");

describe("TrainingSpotAuction", function () {
  let auction;
  let owner;
  let bidderOne;
  let bidderTwo;
  let stranger;

  async function futureTimestamp(days = 7) {
    const block = await ethers.provider.getBlock("latest");
    return block.timestamp + days * 24 * 60 * 60;
  }

  async function mintDefaultSpot() {
    const tx = await auction.mintTrainingSpot(
      "Serena Williams",
      await futureTimestamp(),
      "Exclusive tennis training session",
      "Almaty Premium Gym",
      "ipfs://training-spot-image"
    );

    await tx.wait();
    return 1n;
  }

  beforeEach(async function () {
    [owner, bidderOne, bidderTwo, stranger] = await ethers.getSigners();

    const TrainingSpotAuction = await ethers.getContractFactory("TrainingSpotAuction");
    auction = await TrainingSpotAuction.deploy(owner.address);
    await auction.waitForDeployment();
  });

  it("mints an ERC-721 training spot with metadata and lists it as active", async function () {
    const tokenId = await mintDefaultSpot();

    const spot = await auction.getTrainingSpot(tokenId);
    const activeSpots = await auction.getActiveTrainingSpots();

    expect(await auction.ownerOf(tokenId)).to.equal(await auction.getAddress());
    expect(spot.coachName).to.equal("Serena Williams");
    expect(spot.location).to.equal("Almaty Premium Gym");
    expect(spot.auctionActive).to.equal(true);
    expect(spot.sold).to.equal(false);
    expect(activeSpots.length).to.equal(1);
  });

  it("allows only bids higher than the current highest bid", async function () {
    const tokenId = await mintDefaultSpot();

    await auction.connect(bidderOne).placeBid(tokenId, { value: ethers.parseEther("0.1") });

    await expect(
      auction.connect(bidderTwo).placeBid(tokenId, { value: ethers.parseEther("0.1") })
    ).to.be.revertedWith("Bid must be higher");

    await auction.connect(bidderTwo).placeBid(tokenId, { value: ethers.parseEther("0.2") });

    const spot = await auction.getTrainingSpot(tokenId);
    expect(spot.highestBidder).to.equal(bidderTwo.address);
    expect(spot.highestBid).to.equal(ethers.parseEther("0.2"));
  });

  it("stores the previous highest bid as a withdrawable refund", async function () {
    const tokenId = await mintDefaultSpot();

    await auction.connect(bidderOne).placeBid(tokenId, { value: ethers.parseEther("0.1") });
    await auction.connect(bidderTwo).placeBid(tokenId, { value: ethers.parseEther("0.2") });

    expect(await auction.pendingReturns(bidderOne.address)).to.equal(ethers.parseEther("0.1"));

    await expect(() => auction.connect(bidderOne).withdrawRefund()).to.changeEtherBalance(
      bidderOne,
      ethers.parseEther("0.1")
    );
  });

  it("allows the seller or owner to manually end the auction and transfer the NFT to the winner", async function () {
    const tokenId = await mintDefaultSpot();

    await auction.connect(bidderOne).placeBid(tokenId, { value: ethers.parseEther("0.3") });

    await expect(auction.connect(stranger).endAuction(tokenId)).to.be.revertedWith("Only seller or owner");

    await auction.connect(owner).endAuction(tokenId);

    const spot = await auction.getTrainingSpot(tokenId);

    expect(await auction.ownerOf(tokenId)).to.equal(bidderOne.address);
    expect(spot.sold).to.equal(true);
    expect(spot.auctionActive).to.equal(false);
    expect(await auction.sellerProceeds(owner.address)).to.equal(ethers.parseEther("0.3"));
  });

  it("prevents bids after a spot is sold", async function () {
    const tokenId = await mintDefaultSpot();

    await auction.connect(bidderOne).placeBid(tokenId, { value: ethers.parseEther("0.3") });
    await auction.connect(owner).endAuction(tokenId);

    await expect(
      auction.connect(bidderTwo).placeBid(tokenId, { value: ethers.parseEther("0.4") })
    ).to.be.revertedWith("Auction is not active");
  });

  it("does not allow automatic finalization before 24 hours after the last bid", async function () {
    const tokenId = await mintDefaultSpot();

    await auction.connect(bidderOne).placeBid(tokenId, { value: ethers.parseEther("0.3") });

    expect(await auction.canFinalize(tokenId)).to.equal(false);

    await expect(auction.finalizeAuction(tokenId)).to.be.revertedWith("Auction cannot be finalized yet");
  });

  it("automatically finalizes after 24 hours without a new bid", async function () {
    const tokenId = await mintDefaultSpot();

    await auction.connect(bidderOne).placeBid(tokenId, { value: ethers.parseEther("0.3") });

    await network.provider.send("evm_increaseTime", [24 * 60 * 60 + 1]);
    await network.provider.send("evm_mine");

    expect(await auction.canFinalize(tokenId)).to.equal(true);

    await auction.connect(stranger).finalizeAuction(tokenId);

    const spot = await auction.getTrainingSpot(tokenId);

    expect(await auction.ownerOf(tokenId)).to.equal(bidderOne.address);
    expect(spot.sold).to.equal(true);
    expect(spot.auctionActive).to.equal(false);
  });

  it("blocks new bids after the 24-hour auto-close condition is reached", async function () {
    const tokenId = await mintDefaultSpot();

    await auction.connect(bidderOne).placeBid(tokenId, { value: ethers.parseEther("0.3") });

    await network.provider.send("evm_increaseTime", [24 * 60 * 60 + 1]);
    await network.provider.send("evm_mine");

    await expect(
      auction.connect(bidderTwo).placeBid(tokenId, { value: ethers.parseEther("0.4") })
    ).to.be.revertedWith("Auction expired");
  });
});
