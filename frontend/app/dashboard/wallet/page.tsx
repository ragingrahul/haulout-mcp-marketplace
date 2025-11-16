"use client";

import { useEffect, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { useWallet } from "@suiet/wallet-kit";
import { WalletService, UserBalance } from "@/services/walletService";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowDownToLine,
  AlertCircle,
  Check,
  DollarSign,
  ExternalLink,
  Copy,
} from "lucide-react";
import { Transaction } from "@mysten/sui/transactions";

export default function WalletPage() {
  const { accessToken } = useAuth();
  const {
    connected,
    address: connectedWalletAddress,
    signAndExecuteTransactionBlock,
  } = useWallet();

  // Wallet state
  const [balance, setBalance] = useState<UserBalance | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);
  const [depositAmount, setDepositAmount] = useState("");
  const [isDepositing, setIsDepositing] = useState(false);
  const [depositSuccess, setDepositSuccess] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [platformWalletAddress, setPlatformWalletAddress] =
    useState<string>("");
  const [txHash, setTxHash] = useState<string>("");
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [blockchain, setBlockchain] = useState<string>("Sui");
  const [network, setNetwork] = useState<string>("Testnet");

  // Fetch wallet balance and platform wallet address
  useEffect(() => {
    const fetchBalance = async () => {
      if (!accessToken) return;

      try {
        setIsLoadingBalance(true);
        setWalletError(null);
        const response = await WalletService.getBalance(accessToken);

        if (response.success && response.balance) {
          setBalance(response.balance);
          if (response.platformWalletAddress) {
            setPlatformWalletAddress(response.platformWalletAddress);
          }
          if (response.blockchain) {
            setBlockchain(response.blockchain);
          }
          if (response.network) {
            setNetwork(response.network);
          }
        }
      } catch (err) {
        const error = err as Error;
        setWalletError(error.message || "Error fetching balance");
        console.error("Error fetching balance:", err);
      } finally {
        setIsLoadingBalance(false);
      }
    };

    fetchBalance();
  }, [accessToken]);

  const copyPlatformAddress = async () => {
    if (platformWalletAddress) {
      await navigator.clipboard.writeText(platformWalletAddress);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    }
  };

  const handleDeposit = async () => {
    if (!connected || !connectedWalletAddress) {
      setWalletError("Please connect your Sui wallet first.");
      return;
    }
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      setWalletError("Please enter a valid amount to deposit.");
      return;
    }
    if (!platformWalletAddress) {
      setWalletError(
        "Platform wallet address not available. Please try again."
      );
      return;
    }

    try {
      setWalletError(null);
      setDepositSuccess(false);
      setIsDepositing(true);

      // Convert SUI to MIST (1 SUI = 1,000,000,000 MIST)
      const amountInMist = Math.floor(
        parseFloat(depositAmount) * 1_000_000_000
      );

      // Create transaction to send SUI to platform wallet
      const tx = new Transaction();
      const [coin] = tx.splitCoins(tx.gas, [amountInMist]);
      tx.transferObjects([coin], platformWalletAddress);

      // Sign and execute transaction
      const result = await signAndExecuteTransactionBlock({
        transactionBlock: tx,
      });

      const digest = result.digest;
      setTxHash(digest);

      // Credit deposit on backend
      const creditResponse = await WalletService.creditDeposit(
        accessToken!,
        depositAmount,
        digest
      );

      if (creditResponse.success) {
        setDepositSuccess(true);
        setDepositAmount("");
        // Update balance from response
        if (creditResponse.balance) {
          setBalance(creditResponse.balance);
        }
        setTimeout(() => setDepositSuccess(false), 5000);
      } else {
        setWalletError(creditResponse.message || "Failed to credit deposit");
      }
    } catch (err) {
      const error = err as { code?: number; message?: string };
      if (error.code === 4001) {
        setWalletError("Transaction rejected by user");
      } else {
        setWalletError(error.message || "Error initiating transaction");
      }
      console.error("Error initiating transaction:", err);
    } finally {
      setIsDepositing(false);
    }
  };

  return (
    <ProtectedRoute>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator
                orientation="vertical"
                className="mr-2 data-[orientation=vertical]:h-4"
              />
              <div>
                <h1 className="text-xl font-semibold">My Wallet</h1>
                <p className="text-xs text-muted-foreground">
                  Manage your SUI funds and deposits
                </p>
              </div>
            </div>
          </header>

          <div className="flex flex-1 flex-col gap-4 p-4">
            {/* Error/Success Messages */}
            {walletError && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                <p className="text-sm text-destructive">{walletError}</p>
              </div>
            )}

            {depositSuccess && (
              <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3 flex items-start gap-2">
                <Check className="h-4 w-4 text-green-600 mt-0.5" />
                <p className="text-sm text-green-900 dark:text-green-100">
                  Deposit successful! Your balance has been updated.
                </p>
              </div>
            )}

            {/* Balance Metrics */}
            <div className="grid gap-4 md:grid-cols-3">
              {/* Available Balance */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Available Balance
                  </CardTitle>
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {isLoadingBalance ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    <>
                      <div className="text-2xl font-bold">
                        {balance?.balance_sui || "0"} SUI
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Your current balance
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Total Deposited */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total Deposited
                  </CardTitle>
                  <TrendingUp className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  {isLoadingBalance ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    <>
                      <div className="text-2xl font-bold">
                        {balance?.total_deposited_sui || "0"} SUI
                      </div>
                      <p className="text-xs text-muted-foreground">
                        All-time deposits
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Total Spent */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total Spent
                  </CardTitle>
                  <TrendingDown className="h-4 w-4 text-red-500" />
                </CardHeader>
                <CardContent>
                  {isLoadingBalance ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    <>
                      <div className="text-2xl font-bold">
                        {balance?.total_spent_sui || "0"} SUI
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Spent on MCP tools
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Platform Wallet Info */}
            {platformWalletAddress && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Platform Wallet Address
                  </CardTitle>
                  <CardDescription>
                    Send SUI to this address to deposit funds
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex gap-2">
                    <div className="flex-1 p-3 bg-muted rounded-lg font-mono text-sm break-all">
                      {platformWalletAddress}
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={copyPlatformAddress}
                    >
                      {copiedAddress ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <div className="flex gap-2 text-xs text-muted-foreground">
                    <span>
                      Network: {blockchain} {network}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Deposit Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowDownToLine className="h-5 w-5" />
                  Deposit Funds
                </CardTitle>
                <CardDescription>
                  Deposit SUI from your connected wallet
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Amount (SUI)</label>
                  <Input
                    type="number"
                    placeholder="0.0"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    disabled={isDepositing}
                    step="0.01"
                    min="0"
                  />
                </div>

                <Button
                  onClick={handleDeposit}
                  disabled={
                    !depositAmount ||
                    isDepositing ||
                    parseFloat(depositAmount) <= 0 ||
                    !connected
                  }
                  className="w-full"
                >
                  {isDepositing ? (
                    <>Processing...</>
                  ) : (
                    <>
                      <DollarSign className="h-4 w-4 mr-2" />
                      Deposit SUI
                    </>
                  )}
                </Button>

                {!connected && (
                  <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                    <p className="text-sm text-amber-900 dark:text-amber-100">
                      ⚠️ Please connect your Sui wallet using the button at the
                      bottom of the sidebar to deposit funds.
                    </p>
                  </div>
                )}

                {txHash && (
                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-sm text-blue-900 dark:text-blue-100 flex items-center gap-2">
                      Transaction submitted!{" "}
                      <a
                        href={`https://suiscan.xyz/testnet/tx/${txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline font-medium inline-flex items-center gap-1"
                      >
                        View on Suiscan
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </p>
                  </div>
                )}

                <div className="bg-muted rounded-lg p-4 space-y-2">
                  <h4 className="font-medium text-sm">How it works:</h4>
                  <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Connect your Sui wallet (Sui Wallet, Suiet, etc.)</li>
                    <li>Enter the amount of SUI you want to deposit</li>
                    <li>
                      Click &quot;Deposit SUI&quot; to initiate the transaction
                    </li>
                    <li>Approve the transaction in your wallet</li>
                    <li>Your balance will be automatically updated</li>
                  </ol>
                </div>

                <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <p className="text-sm text-blue-900 dark:text-blue-100 font-medium mb-1">
                    💡 Get Test SUI
                  </p>
                  <p className="text-xs text-blue-800 dark:text-blue-200">
                    Need test SUI? Get free test tokens from the{" "}
                    <a
                      href="https://discord.gg/sui"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-medium"
                    >
                      Sui Discord
                    </a>{" "}
                    faucet channel.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </ProtectedRoute>
  );
}
