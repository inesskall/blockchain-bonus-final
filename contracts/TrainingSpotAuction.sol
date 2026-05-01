// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract TrainingSpotAuction is ERC721, Ownable, ReentrancyGuard {
    using Strings for uint256;

    uint256 public constant AUTO_CLOSE_TIME = 24 hours;

    uint256 private nextTokenId;
    uint256[] private tokenIds;

    struct TrainingSpot {
        uint256 tokenId;
        string coachName;
        uint256 trainingDateTime;
        string description;
        string location;
        string image;
        address payable seller;
        bool sold;
        bool auctionActive;
        uint256 highestBid;
        address payable highestBidder;
        uint256 lastBidTime;
        uint256 createdAt;
    }

    mapping(uint256 => TrainingSpot) private trainingSpots;
    mapping(address => uint256) public pendingReturns;
    mapping(address => uint256) public sellerProceeds;

    event TrainingSpotMinted(
        uint256 indexed tokenId,
        address indexed seller,
        string coachName,
        uint256 trainingDateTime,
        string location
    );
    event BidPlaced(uint256 indexed tokenId, address indexed bidder, uint256 amount);
    event AuctionEnded(uint256 indexed tokenId, address indexed winner, uint256 amount, bool automatic);
    event RefundWithdrawn(address indexed bidder, uint256 amount);
    event SellerProceedsWithdrawn(address indexed seller, uint256 amount);

    constructor(address initialOwner) ERC721("Premium Training Spot", "PTS") Ownable(initialOwner) {}

    modifier existingSpot(uint256 tokenId) {
        require(_spotExists(tokenId), "Spot does not exist");
        _;
    }

    modifier onlySellerOrOwner(uint256 tokenId) {
        require(
            msg.sender == owner() || msg.sender == trainingSpots[tokenId].seller,
            "Only seller or owner"
        );
        _;
    }

    function mintTrainingSpot(
        string calldata coachName,
        uint256 trainingDateTime,
        string calldata description,
        string calldata location,
        string calldata image
    ) external onlyOwner returns (uint256) {
        require(bytes(coachName).length > 0, "Coach name is required");
        require(trainingDateTime > block.timestamp, "Training time must be future");
        require(bytes(description).length > 0, "Description is required");
        require(bytes(location).length > 0, "Location is required");

        nextTokenId++;
        uint256 tokenId = nextTokenId;

        _mint(address(this), tokenId);

        trainingSpots[tokenId] = TrainingSpot({
            tokenId: tokenId,
            coachName: coachName,
            trainingDateTime: trainingDateTime,
            description: description,
            location: location,
            image: image,
            seller: payable(msg.sender),
            sold: false,
            auctionActive: true,
            highestBid: 0,
            highestBidder: payable(address(0)),
            lastBidTime: 0,
            createdAt: block.timestamp
        });

        tokenIds.push(tokenId);

        emit TrainingSpotMinted(tokenId, msg.sender, coachName, trainingDateTime, location);
        return tokenId;
    }

    function placeBid(uint256 tokenId) external payable nonReentrant existingSpot(tokenId) {
        TrainingSpot storage spot = trainingSpots[tokenId];

        require(spot.auctionActive, "Auction is not active");
        require(!spot.sold, "Spot already sold");
        require(!isAuctionExpired(tokenId), "Auction expired");
        require(msg.sender != spot.seller, "Seller cannot bid");
        require(msg.value > spot.highestBid, "Bid must be higher");

        if (spot.highestBidder != address(0)) {
            pendingReturns[spot.highestBidder] += spot.highestBid;
        }

        spot.highestBid = msg.value;
        spot.highestBidder = payable(msg.sender);
        spot.lastBidTime = block.timestamp;

        emit BidPlaced(tokenId, msg.sender, msg.value);
    }

    function endAuction(uint256 tokenId)
        external
        nonReentrant
        existingSpot(tokenId)
        onlySellerOrOwner(tokenId)
    {
        TrainingSpot storage spot = trainingSpots[tokenId];

        require(spot.auctionActive, "Auction is not active");
        require(!spot.sold, "Spot already sold");
        require(spot.highestBidder != address(0), "No bids placed");

        _finalizeAuction(tokenId, false);
    }

    function finalizeAuction(uint256 tokenId) external nonReentrant existingSpot(tokenId) {
        require(canFinalize(tokenId), "Auction cannot be finalized yet");
        _finalizeAuction(tokenId, true);
    }

    function withdrawRefund() external nonReentrant {
        uint256 amount = pendingReturns[msg.sender];
        require(amount > 0, "No refund available");

        pendingReturns[msg.sender] = 0;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Refund transfer failed");

        emit RefundWithdrawn(msg.sender, amount);
    }

    function withdrawSellerProceeds() external nonReentrant {
        uint256 amount = sellerProceeds[msg.sender];
        require(amount > 0, "No proceeds available");

        sellerProceeds[msg.sender] = 0;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Proceeds transfer failed");

        emit SellerProceedsWithdrawn(msg.sender, amount);
    }

    function getTrainingSpot(uint256 tokenId)
        external
        view
        existingSpot(tokenId)
        returns (TrainingSpot memory)
    {
        return trainingSpots[tokenId];
    }

    function getAllTrainingSpots() external view returns (TrainingSpot[] memory) {
        TrainingSpot[] memory result = new TrainingSpot[](tokenIds.length);

        for (uint256 i = 0; i < tokenIds.length; i++) {
            result[i] = trainingSpots[tokenIds[i]];
        }

        return result;
    }

    function getActiveTrainingSpots() external view returns (TrainingSpot[] memory) {
        uint256 activeCount = 0;

        for (uint256 i = 0; i < tokenIds.length; i++) {
            TrainingSpot memory spot = trainingSpots[tokenIds[i]];
            if (spot.auctionActive && !spot.sold) {
                activeCount++;
            }
        }

        TrainingSpot[] memory result = new TrainingSpot[](activeCount);
        uint256 index = 0;

        for (uint256 i = 0; i < tokenIds.length; i++) {
            TrainingSpot memory spot = trainingSpots[tokenIds[i]];
            if (spot.auctionActive && !spot.sold) {
                result[index] = spot;
                index++;
            }
        }

        return result;
    }

    function canFinalize(uint256 tokenId) public view existingSpot(tokenId) returns (bool) {
        return isAuctionExpired(tokenId);
    }

    function isAuctionExpired(uint256 tokenId) public view existingSpot(tokenId) returns (bool) {
        TrainingSpot memory spot = trainingSpots[tokenId];

        return spot.auctionActive
            && !spot.sold
            && spot.highestBidder != address(0)
            && block.timestamp >= spot.lastBidTime + AUTO_CLOSE_TIME;
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override
        existingSpot(tokenId)
        returns (string memory)
    {
        TrainingSpot memory spot = trainingSpots[tokenId];

        string memory json = Base64.encode(
            bytes(
                string.concat(
                    '{"name":"Premium Training Spot #',
                    tokenId.toString(),
                    '","description":"',
                    spot.description,
                    '","image":"',
                    spot.image,
                    '","attributes":[{"trait_type":"Coach","value":"',
                    spot.coachName,
                    '"},{"trait_type":"Location","value":"',
                    spot.location,
                    '"},{"trait_type":"Training Date Time","value":"',
                    spot.trainingDateTime.toString(),
                    '"}]}'
                )
            )
        );

        return string.concat("data:application/json;base64,", json);
    }

    function _finalizeAuction(uint256 tokenId, bool automatic) private {
        TrainingSpot storage spot = trainingSpots[tokenId];

        spot.auctionActive = false;
        spot.sold = true;
        sellerProceeds[spot.seller] += spot.highestBid;

        _transfer(address(this), spot.highestBidder, tokenId);

        emit AuctionEnded(tokenId, spot.highestBidder, spot.highestBid, automatic);
    }

    function _spotExists(uint256 tokenId) private view returns (bool) {
        return tokenId > 0 && tokenId <= nextTokenId;
    }
}
