import React, { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import auctionAbi from "./abi/TrainingSpotAuction.json";
import contractConfig from "./config/contract.json";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";

function formatAddress(address) {
  if (!address || address === ZERO_ADDRESS) {
    return "No bids yet";
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatEth(value) {
  return `${ethers.formatEther(value || 0n)} ETH`;
}

function formatDate(timestamp) {
  return new Date(Number(timestamp) * 1000).toLocaleString();
}

function parseError(error) {
  return error?.shortMessage || error?.reason || error?.message || "Unknown error";
}

export default function App() {
  const [account, setAccount] = useState("");
  const [ownerAddress, setOwnerAddress] = useState("");
  const [spots, setSpots] = useState([]);
  const [bidValues, setBidValues] = useState({});
  const [pendingRefund, setPendingRefund] = useState(0n);
  const [sellerBalance, setSellerBalance] = useState(0n);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const isConfigured = useMemo(() => {
    return contractConfig.address && contractConfig.address !== ZERO_ADDRESS;
  }, []);

  useEffect(() => {
    if (!window.ethereum) {
      return;
    }

    const handleAccountsChanged = (accounts) => {
      const selected = accounts[0] || "";
      setAccount(selected);
      if (selected) {
        loadContractData(selected);
      } else {
        setSpots([]);
        setPendingRefund(0n);
        setSellerBalance(0n);
      }
    };

    const handleChainChanged = () => {
      window.location.reload();
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, []);

  async function getContract() {
    if (!window.ethereum) {
      throw new Error("MetaMask is not installed");
    }

    if (!isConfigured) {
      throw new Error("Contract address is not configured. Deploy the contract first.");
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    return new ethers.Contract(contractConfig.address, auctionAbi, signer);
  }

  async function switchToSepolia() {
    if (contractConfig.chainId !== SEPOLIA_CHAIN_ID) {
      return;
    }

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }]
      });
    } catch (error) {
      if (error.code !== 4902) {
        throw error;
      }

      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: SEPOLIA_CHAIN_ID_HEX,
            chainName: "Sepolia Test Network",
            nativeCurrency: {
              name: "Sepolia ETH",
              symbol: "ETH",
              decimals: 18
            },
            rpcUrls: ["https://rpc.sepolia.org"],
            blockExplorerUrls: ["https://sepolia.etherscan.io"]
          }
        ]
      });
    }
  }

  async function connectWallet() {
    try {
      setLoading(true);
      setStatus("Connecting wallet...");

      if (!window.ethereum) {
        throw new Error("Install MetaMask first");
      }

      await switchToSepolia();
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const selectedAccount = accounts[0];

      setAccount(selectedAccount);
      await loadContractData(selectedAccount);
      setStatus("Wallet connected");
    } catch (error) {
      setStatus(parseError(error));
    } finally {
      setLoading(false);
    }
  }

  async function disconnectWallet() {
    setAccount("");
    setOwnerAddress("");
    setSpots([]);
    setBidValues({});
    setPendingRefund(0n);
    setSellerBalance(0n);
    setStatus("Wallet disconnected from this interface");
  }

  async function loadContractData(selectedAccount = account) {
    try {
      setLoading(true);

      const contract = await getContract();
      const rawSpots = await contract.getActiveTrainingSpots();
      const contractOwner = await contract.owner();

      const mappedSpots = await Promise.all(
        rawSpots.map(async (spot) => {
          const tokenId = spot.tokenId;
          const canFinalize = await contract.canFinalize(tokenId);

          return {
            tokenId,
            coachName: spot.coachName,
            trainingDateTime: spot.trainingDateTime,
            description: spot.description,
            location: spot.location,
            image: spot.image,
            seller: spot.seller,
            sold: spot.sold,
            auctionActive: spot.auctionActive,
            highestBid: spot.highestBid,
            highestBidder: spot.highestBidder,
            lastBidTime: spot.lastBidTime,
            createdAt: spot.createdAt,
            canFinalize
          };
        })
      );

      setOwnerAddress(contractOwner);
      setSpots(mappedSpots);

      if (selectedAccount) {
        setPendingRefund(await contract.pendingReturns(selectedAccount));
        setSellerBalance(await contract.sellerProceeds(selectedAccount));
      }
    } catch (error) {
      setStatus(parseError(error));
    } finally {
      setLoading(false);
    }
  }

  async function placeBid(tokenId) {
    try {
      const value = bidValues[tokenId.toString()];

      if (!value || Number(value) <= 0) {
        throw new Error("Enter a valid ETH amount");
      }

      setLoading(true);
      setStatus("Sending bid transaction...");

      const contract = await getContract();
      const tx = await contract.placeBid(tokenId, { value: ethers.parseEther(value) });
      await tx.wait();

      setBidValues((previous) => ({ ...previous, [tokenId.toString()]: "" }));
      await loadContractData();
      setStatus("Bid placed successfully");
    } catch (error) {
      setStatus(parseError(error));
    } finally {
      setLoading(false);
    }
  }

  async function endAuction(tokenId) {
    try {
      setLoading(true);
      setStatus("Ending auction...");

      const contract = await getContract();
      const tx = await contract.endAuction(tokenId);
      await tx.wait();

      await loadContractData();
      setStatus("Auction ended. NFT transferred to the highest bidder.");
    } catch (error) {
      setStatus(parseError(error));
    } finally {
      setLoading(false);
    }
  }

  async function finalizeAuction(tokenId) {
    try {
      setLoading(true);
      setStatus("Finalizing expired auction...");

      const contract = await getContract();
      const tx = await contract.finalizeAuction(tokenId);
      await tx.wait();

      await loadContractData();
      setStatus("Expired auction finalized. NFT transferred to the highest bidder.");
    } catch (error) {
      setStatus(parseError(error));
    } finally {
      setLoading(false);
    }
  }

  async function withdrawRefund() {
    try {
      setLoading(true);
      setStatus("Withdrawing refund...");

      const contract = await getContract();
      const tx = await contract.withdrawRefund();
      await tx.wait();

      await loadContractData();
      setStatus("Refund withdrawn");
    } catch (error) {
      setStatus(parseError(error));
    } finally {
      setLoading(false);
    }
  }

  async function withdrawSellerProceeds() {
    try {
      setLoading(true);
      setStatus("Withdrawing seller proceeds...");

      const contract = await getContract();
      const tx = await contract.withdrawSellerProceeds();
      await tx.wait();

      await loadContractData();
      setStatus("Seller proceeds withdrawn");
    } catch (error) {
      setStatus(parseError(error));
    } finally {
      setLoading(false);
    }
  }

  function updateBidValue(tokenId, value) {
    setBidValues((previous) => ({ ...previous, [tokenId.toString()]: value }));
  }

  function isSellerOrOwner(spot) {
    if (!account) {
      return false;
    }

    const current = account.toLowerCase();
    return current === spot.seller.toLowerCase() || current === ownerAddress.toLowerCase();
  }

  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">ERC-721 Auction</p>
          <h1>Premium Training Spot Auction</h1>
          <p className="subtitle">
            Bid for exclusive NFT training spots with celebrity coaches. Highest bidder wins the ERC-721 token after manual or 24-hour automatic close.
          </p>
        </div>

        <div className="wallet-card">
          <p className="label">Wallet</p>
          {account ? (
            <>
              <strong>{formatAddress(account)}</strong>
              <button onClick={disconnectWallet} disabled={loading}>Sign Out / Disconnect</button>
            </>
          ) : (
            <button onClick={connectWallet} disabled={loading}>Register / Connect MetaMask</button>
          )}
        </div>
      </section>

      {!isConfigured && (
        <div className="notice error">
          Contract address is not configured. Run deployment first. The deploy script will update frontend/src/config/contract.json.
        </div>
      )}

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Auctioned Training Spots</h2>
            <p>Network: {contractConfig.network} | Contract: {formatAddress(contractConfig.address)}</p>
          </div>
          <button onClick={() => loadContractData()} disabled={loading || !account}>Refresh</button>
        </div>

        {status && <div className="notice">{status}</div>}

        {account && (
          <div className="balances">
            <div>
              <span>Refund available</span>
              <strong>{formatEth(pendingRefund)}</strong>
              <button onClick={withdrawRefund} disabled={loading || pendingRefund === 0n}>Withdraw Refund</button>
            </div>
            <div>
              <span>Seller proceeds</span>
              <strong>{formatEth(sellerBalance)}</strong>
              <button onClick={withdrawSellerProceeds} disabled={loading || sellerBalance === 0n}>Withdraw Proceeds</button>
            </div>
          </div>
        )}

        {!account && <div className="empty">Connect MetaMask to load auctions.</div>}

        {account && spots.length === 0 && <div className="empty">No active auctions found.</div>}

        <div className="grid">
          {spots.map((spot) => (
            <article className="card" key={spot.tokenId.toString()}>
              {spot.image ? (
                <img src={spot.image} alt={spot.coachName} />
              ) : (
                <div className="image-fallback">No Image</div>
              )}

              <div className="card-body">
                <div className="card-title-row">
                  <h3>{spot.coachName}</h3>
                  <span>#{spot.tokenId.toString()}</span>
                </div>

                <p>{spot.description}</p>

                <dl>
                  <div>
                    <dt>Date / Time</dt>
                    <dd>{formatDate(spot.trainingDateTime)}</dd>
                  </div>
                  <div>
                    <dt>Location</dt>
                    <dd>{spot.location}</dd>
                  </div>
                  <div>
                    <dt>Highest Bid</dt>
                    <dd>{formatEth(spot.highestBid)}</dd>
                  </div>
                  <div>
                    <dt>Highest Bidder</dt>
                    <dd>{formatAddress(spot.highestBidder)}</dd>
                  </div>
                  <div>
                    <dt>Seller</dt>
                    <dd>{formatAddress(spot.seller)}</dd>
                  </div>
                </dl>

                <div className="bid-row">
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    placeholder="ETH amount"
                    value={bidValues[spot.tokenId.toString()] || ""}
                    onChange={(event) => updateBidValue(spot.tokenId, event.target.value)}
                    disabled={loading || spot.canFinalize}
                  />
                  <button onClick={() => placeBid(spot.tokenId)} disabled={loading || spot.canFinalize}>
                    Place Bid
                  </button>
                </div>

                <div className="actions">
                  {isSellerOrOwner(spot) && (
                    <button onClick={() => endAuction(spot.tokenId)} disabled={loading || spot.highestBidder === ZERO_ADDRESS}>
                      End Manually
                    </button>
                  )}

                  <button onClick={() => finalizeAuction(spot.tokenId)} disabled={loading || !spot.canFinalize}>
                    Auto Finalize 24h
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
