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
import { SuiClient } from "@mysten/sui/client";
import { WalletService, UserBalance } from "@/services/walletService";
import {
  OAuthService,
  OAuthClient,
  OAuthCredentials,
} from "@/services/oauthService";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
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
  Key,
  Plus,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";
import { formatSuiDisplay } from "@/lib/utils";
import { toast } from "sonner";

export default function WalletPage() {
  const { accessToken } = useAuth();
  const {
    connected,
    address: connectedWalletAddress,
    signAndExecuteTransaction,
  } = useWallet();

  // Initialize Sui client
  const suiClient = new SuiClient({
    url:
      process.env.NEXT_PUBLIC_SUI_RPC_URL ||
      "https://fullnode.testnet.sui.io:443",
  });

  // Wallet state
  const [balance, setBalance] = useState<UserBalance | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);
  const [depositAmount, setDepositAmount] = useState("");
  const [isDepositing, setIsDepositing] = useState(false);
  const [depositSuccess, setDepositSuccess] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [backendWalletAddress, setBackendWalletAddress] = useState<string>("");
  const [nativeSuiBalance, setNativeSuiBalance] = useState<string>("");
  const [hasBalanceAccount, setHasBalanceAccount] = useState<boolean>(false);
  const [txHash, setTxHash] = useState<string>("");
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [blockchain, setBlockchain] = useState<string>("Sui");
  const [network, setNetwork] = useState<string>("Testnet");

  // OAuth state
  const [oauthClients, setOauthClients] = useState<OAuthClient[]>([]);
  const [isLoadingOAuth, setIsLoadingOAuth] = useState(true);
  const [isCreatingOAuth, setIsCreatingOAuth] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showCredentialsDialog, setShowCredentialsDialog] = useState(false);
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [clientToRevoke, setClientToRevoke] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [newClientName, setNewClientName] = useState("");
  const [newCredentials, setNewCredentials] = useState<OAuthCredentials | null>(
    null
  );
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [copiedClientId, setCopiedClientId] = useState(false);
  const [copiedClientSecret, setCopiedClientSecret] = useState(false);
  const [copiedMcpUrl, setCopiedMcpUrl] = useState(false);
  const [walletSynced, setWalletSynced] = useState(false);

  // Sync wallet connection with backend when user connects wallet
  useEffect(() => {
    const syncWalletConnection = async () => {
      if (!connected || !connectedWalletAddress || !accessToken) {
        setWalletSynced(false);
        return;
      }

      try {
        // Check if this wallet is already synced
        const connectedWallet = await WalletService.getConnectedWallet(
          accessToken
        );

        // If wallet is already connected and matches, no need to sync
        if (
          connectedWallet.is_connected &&
          connectedWallet.wallet_address === connectedWalletAddress
        ) {
          setWalletSynced(true);
          return;
        }

        // If different wallet or not connected, sync it
        console.log(`Syncing wallet connection: ${connectedWalletAddress}`);
        await WalletService.connectWallet(accessToken, connectedWalletAddress);
        console.log("Wallet synced successfully with backend");
        setWalletSynced(true);
        toast.success("Wallet Connected", {
          description: `Connected ${connectedWalletAddress.slice(0, 10)}...`,
        });
      } catch (err) {
        const error = err as Error;
        setWalletSynced(false);

        // Handle wallet conflict gracefully
        if (error.message?.includes("already connected to another account")) {
          console.log("⚠️ Wallet conflict:", error.message);
          toast.error("Wallet Already in Use", {
            description:
              "This wallet is connected to another account. Please disconnect it first or use a different wallet.",
            duration: 6000,
          });
        } else {
          console.log("ℹ️ Wallet sync issue:", error.message);
          toast.warning("Wallet Sync Issue", {
            description:
              error.message ||
              "Could not sync wallet with backend. Please try reconnecting.",
            duration: 5000,
          });
        }
      }
    };

    syncWalletConnection();
  }, [connected, connectedWalletAddress, accessToken]);

  // Fetch wallet balance and platform wallet address
  const fetchBalance = async () => {
    if (!accessToken) return;

    // Wait for wallet sync to complete if wallet is connected
    if (connected && connectedWalletAddress && !walletSynced) {
      console.log("⏳ Waiting for wallet sync to complete...");
      return;
    }

    try {
      setIsLoadingBalance(true);
      setWalletError(null);
      const response = await WalletService.getBalance(accessToken);

      if (response.success && response.balance) {
        setBalance(response.balance);
        if (response.walletAddress) {
          setBackendWalletAddress(response.walletAddress);
        }
        if (response.nativeSuiBalance) {
          setNativeSuiBalance(response.nativeSuiBalance);
        }
        if (response.has_balance_account !== undefined) {
          setHasBalanceAccount(response.has_balance_account);
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
      // Don't show error for wallet not connected - this is expected
      if (error.message?.includes("No wallet connected")) {
        console.log(
          "ℹ️ Wallet not connected yet. Connect wallet to see balance."
        );
      } else {
        setWalletError(error.message || "Error fetching balance");
        console.warn("⚠️ Error fetching balance:", error.message);
      }
    } finally {
      setIsLoadingBalance(false);
    }
  };

  useEffect(() => {
    fetchBalance();
  }, [accessToken, connected, connectedWalletAddress, walletSynced]);

  const copyWalletAddress = async () => {
    if (backendWalletAddress) {
      await navigator.clipboard.writeText(backendWalletAddress);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    }
  };

  const handleDeposit = async () => {
    if (!connected || !connectedWalletAddress) {
      toast.warning("Wallet Not Connected", {
        description: "Please connect your Sui wallet first.",
      });
      return;
    }

    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0) {
      toast.error("Invalid Amount", {
        description: "Please enter a valid amount greater than 0",
      });
      return;
    }

    if (!accessToken) {
      toast.error("Not Authenticated", {
        description: "Please log in again",
      });
      return;
    }

    setIsDepositing(true);

    try {
      const { Transaction } = await import("@mysten/sui/transactions");
      const packageId = process.env.NEXT_PUBLIC_SUI_PACKAGE_ID;

      if (!packageId) {
        throw new Error("SUI_PACKAGE_ID not configured");
      }

      // 1. Check if user has UserBalance object
      const balanceCheck = await WalletService.getBalance(accessToken);
      let userBalanceId = balanceCheck.balance_object_id;

      // 2. Create balance account if needed
      if (!balanceCheck.has_balance_account) {
        toast.info("Creating balance account...", {
          description: "This is a one-time setup",
        });

        const createTx = new Transaction();
        createTx.moveCall({
          target: `${packageId}::payment_system::create_balance`,
          arguments: [
            createTx.object("0x6"), // Sui Clock object
          ],
        });

        const createResult = await signAndExecuteTransaction({
          transaction: createTx,
        });

        // Wait for transaction to be indexed
        const txResponse = await suiClient.waitForTransaction({
          digest: createResult.digest,
          options: {
            showObjectChanges: true,
          },
        });

        // Extract the created UserBalance object ID from transaction
        const createdObject = txResponse.objectChanges?.find(
          (change) =>
            change.type === "created" &&
            change.objectType.includes("::payment_system::UserBalance")
        );

        if (createdObject && "objectId" in createdObject) {
          userBalanceId = createdObject.objectId;
          toast.success("Balance account created!");
        } else {
          throw new Error(
            "Failed to find created UserBalance object in transaction"
          );
        }
      }

      if (!userBalanceId) {
        throw new Error(
          "No UserBalance object found. Please try again or contact support."
        );
      }

      // 3. Deposit funds
      const depositTx = new Transaction();
      const amountMist = Math.floor(amount * 1_000_000_000);
      const [coin] = depositTx.splitCoins(depositTx.gas, [
        depositTx.pure.u64(amountMist),
      ]);

      depositTx.moveCall({
        target: `${packageId}::payment_system::deposit_funds`,
        arguments: [
          depositTx.object(userBalanceId), // UserBalance object
          coin, // Coin to deposit
          depositTx.object("0x6"), // Sui Clock object
        ],
      });

      const depositResult = await signAndExecuteTransaction({
        transaction: depositTx,
      });

      const txDigest = depositResult.digest;
      setTxHash(txDigest);

      await suiClient.waitForTransaction({
        digest: txDigest,
      });

      toast.success(`Deposited ${amount} SUI successfully!`, {
        description: `Transaction: ${txDigest.slice(0, 10)}...`,
      });

      setDepositAmount("");
      setDepositSuccess(true);

      // Refresh balance after a delay to allow indexing
      setTimeout(() => {
        fetchBalance();
      }, 3000); // Increased delay to 3 seconds
    } catch (error) {
      const err = error as Error;
      console.warn("Deposit error:", err);
      toast.error("Deposit Failed", {
        description: err.message || "Failed to deposit funds",
      });
    } finally {
      setIsDepositing(false);
    }
  };

  // Fetch OAuth clients
  useEffect(() => {
    const fetchOAuthClients = async () => {
      if (!accessToken) return;

      try {
        setIsLoadingOAuth(true);
        const response = await OAuthService.getClients(accessToken);
        if (response.success) {
          setOauthClients(response.clients);
        }
      } catch (err) {
        const error = err as Error;
        console.log("ℹ️ Could not fetch OAuth clients:", error.message);
        // Silently fail for OAuth clients fetch - not critical
        // Only show error if user tries to interact
      } finally {
        setIsLoadingOAuth(false);
      }
    };

    fetchOAuthClients();
  }, [accessToken]);

  const handleCreateOAuthClient = async () => {
    if (!accessToken) {
      toast.error("Authentication Required", {
        description: "Please log in to create OAuth credentials.",
      });
      return;
    }

    if (!newClientName.trim()) {
      toast.warning("Name Required", {
        description: "Please enter a name for your OAuth client.",
      });
      return;
    }

    try {
      setIsCreatingOAuth(true);
      const response = await OAuthService.createClient(
        accessToken,
        newClientName
      );

      if (response.success && response.credentials) {
        setNewCredentials(response.credentials);
        setShowCreateDialog(false);
        setShowCredentialsDialog(true);
        setNewClientName("");

        toast.success("OAuth Client Created!", {
          description:
            "Your OAuth credentials have been generated. Save them now!",
        });

        // Refresh clients list
        const clientsResponse = await OAuthService.getClients(accessToken);
        if (clientsResponse.success) {
          setOauthClients(clientsResponse.clients);
        }
      }
    } catch (err) {
      const error = err as Error;
      toast.error("Failed to Create OAuth Client", {
        description:
          error.message || "An error occurred while creating the OAuth client.",
      });
    } finally {
      setIsCreatingOAuth(false);
    }
  };

  const confirmRevokeOAuthClient = (clientId: string, clientName: string) => {
    setClientToRevoke({ id: clientId, name: clientName });
    setShowRevokeDialog(true);
  };

  const handleRevokeOAuthClient = async () => {
    if (!clientToRevoke || !accessToken) {
      toast.error("Authentication Required", {
        description: "Please log in to revoke OAuth credentials.",
      });
      return;
    }

    try {
      await OAuthService.revokeClient(accessToken, clientToRevoke.id);

      toast.success("OAuth Client Revoked", {
        description: "The OAuth client has been successfully revoked.",
      });

      setShowRevokeDialog(false);
      setClientToRevoke(null);

      // Refresh clients list
      const response = await OAuthService.getClients(accessToken);
      if (response.success) {
        setOauthClients(response.clients);
      }
    } catch (err) {
      const error = err as Error;
      toast.error("Failed to Revoke OAuth Client", {
        description:
          error.message || "An error occurred while revoking the OAuth client.",
      });
    }
  };

  const copyToClipboard = async (
    text: string,
    setter: (value: boolean) => void
  ) => {
    try {
      await navigator.clipboard.writeText(text);
      setter(true);
      setTimeout(() => setter(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
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
                        {formatSuiDisplay(balance?.balance_sui || "0")} SUI
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
                        {formatSuiDisplay(balance?.total_deposited_sui || "0")}{" "}
                        SUI
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
                        {formatSuiDisplay(balance?.total_spent_sui || "0")} SUI
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Spent on MCP tools
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Connected Wallet Info */}
            {backendWalletAddress && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Connected Wallet</CardTitle>
                  <CardDescription>
                    Your Sui wallet connected to this platform
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex gap-2">
                    <div className="flex-1 p-3 bg-muted rounded-lg font-mono text-sm break-all">
                      {backendWalletAddress}
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={copyWalletAddress}
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
                    {nativeSuiBalance && (
                      <span className="ml-2">
                        • Native Balance: {formatSuiDisplay(nativeSuiBalance)}{" "}
                        SUI
                      </span>
                    )}
                  </div>
                  {!hasBalanceAccount && (
                    <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded text-xs">
                      <p className="text-amber-900 dark:text-amber-100">
                        No on-chain balance tracking yet. Once you make
                        payments, a balance account will be created
                        automatically.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* OAuth Credentials Section */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Key className="h-5 w-5" />
                      OAuth Credentials (For Claude Desktop)
                    </CardTitle>
                    <CardDescription>
                      Create OAuth credentials for Claude Desktop MCP
                      authentication
                    </CardDescription>
                  </div>
                  <Button onClick={() => setShowCreateDialog(true)} size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Create New
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingOAuth ? (
                  <div className="space-y-2">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                ) : oauthClients.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Key className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No OAuth clients yet</p>
                    <p className="text-sm">
                      Create one to connect Claude Desktop with your MCP servers
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {oauthClients.map((client) => (
                      <div
                        key={client.client_id}
                        className="border rounded-lg p-4 space-y-2"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="font-medium">
                              {client.client_name}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              Client ID:{" "}
                              <code className="bg-muted px-1 rounded">
                                {client.client_id}
                              </code>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              Created:{" "}
                              {new Date(client.created_at).toLocaleDateString()}
                              {client.last_used_at && (
                                <>
                                  {" "}
                                  • Last used:{" "}
                                  {new Date(
                                    client.last_used_at
                                  ).toLocaleDateString()}
                                </>
                              )}
                            </div>
                            <div className="flex gap-1 mt-2">
                              {client.scopes.map((scope) => (
                                <span
                                  key={scope}
                                  className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded"
                                >
                                  {scope}
                                </span>
                              ))}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              confirmRevokeOAuthClient(
                                client.client_id,
                                client.client_name
                              )
                            }
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4 space-y-3">
                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-sm text-blue-900 dark:text-blue-100 font-medium mb-2">
                      💡 For Claude Desktop:
                    </p>
                    <ol className="text-xs text-blue-800 dark:text-blue-200 space-y-1 list-decimal list-inside">
                      <li>Create an OAuth client above</li>
                      <li>
                        Copy the <strong>client_id</strong> and{" "}
                        <strong>client_secret</strong> (shown once)
                      </li>
                      <li>
                        Add them to Claude Desktop config with the MCP URL
                      </li>
                      <li>
                        Restart Claude Desktop and authorize when prompted
                      </li>
                    </ol>
                  </div>

                  <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3">
                    <p className="text-sm text-green-900 dark:text-green-100 font-medium mb-2">
                      🤖 For OpenAI / ChatGPT:
                    </p>
                    <p className="text-xs text-green-800 dark:text-green-200 mb-2">
                      OpenAI uses{" "}
                      <strong>Dynamic Client Registration (DCR)</strong> - no
                      manual setup needed!
                    </p>
                    <ol className="text-xs text-green-800 dark:text-green-200 space-y-1 list-decimal list-inside">
                      <li>Just provide the MCP URL in ChatGPT settings</li>
                      <li>
                        OpenAI automatically registers (creates{" "}
                        <code className="bg-green-100 dark:bg-green-900 px-1 rounded">
                          dcr_*
                        </code>{" "}
                        client)
                      </li>
                      <li>
                        No client_secret needed - it&apos;s handled
                        automatically!
                      </li>
                      <li>Authorize when prompted and you&apos;re done</li>
                    </ol>
                  </div>
                </div>
              </CardContent>
            </Card>

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
                  <h4 className="font-medium text-sm">Non-Custodial System:</h4>
                  <p className="text-sm text-muted-foreground">
                    This platform uses a non-custodial model. Your SUI stays in
                    your wallet. When you use paid APIs, payments go directly
                    from your wallet to the developer via smart contract - no
                    intermediary!
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>You control your funds (non-custodial)</li>
                    <li>Direct peer-to-peer payments</li>
                    <li>On-chain transparency</li>
                    <li>No platform custody risk</li>
                  </ul>
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

      {/* Create OAuth Client Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create OAuth Client</DialogTitle>
            <DialogDescription>
              Create new OAuth credentials for MCP server authentication
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="client-name">Client Name</Label>
              <Input
                id="client-name"
                placeholder="My Claude Desktop"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                disabled={isCreatingOAuth}
              />
              <p className="text-xs text-muted-foreground">
                A descriptive name for this OAuth client
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              disabled={isCreatingOAuth}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateOAuthClient}
              disabled={!newClientName.trim() || isCreatingOAuth}
            >
              {isCreatingOAuth ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* OAuth Credentials Display Dialog */}
      <Dialog
        open={showCredentialsDialog}
        onOpenChange={setShowCredentialsDialog}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>OAuth Credentials Created!</DialogTitle>
            <DialogDescription>
              Save these credentials securely. The client secret will only be
              shown once.
            </DialogDescription>
          </DialogHeader>
          {newCredentials && (
            <div className="space-y-4 py-4">
              {/* Client ID */}
              <div className="space-y-2">
                <Label>Client ID</Label>
                <div className="flex gap-2">
                  <div className="flex-1 p-3 bg-muted rounded-lg font-mono text-sm break-all">
                    {newCredentials.client_id}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      copyToClipboard(
                        newCredentials.client_id,
                        setCopiedClientId
                      )
                    }
                  >
                    {copiedClientId ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Client Secret */}
              <div className="space-y-2">
                <Label>Client Secret</Label>
                <div className="flex gap-2">
                  <div className="flex-1 p-3 bg-muted rounded-lg font-mono text-sm break-all">
                    {showClientSecret
                      ? newCredentials.client_secret
                      : "••••••••••••••••••••••••"}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowClientSecret(!showClientSecret)}
                  >
                    {showClientSecret ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      copyToClipboard(
                        newCredentials.client_secret,
                        setCopiedClientSecret
                      )
                    }
                  >
                    {copiedClientSecret ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  ⚠️ Save this secret now! It will not be shown again.
                </p>
              </div>

              {/* MCP URL */}
              <div className="space-y-2">
                <Label>MCP Server URL</Label>
                <div className="flex gap-2">
                  <div className="flex-1 p-3 bg-muted rounded-lg font-mono text-sm break-all">
                    {newCredentials.mcp_url}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      copyToClipboard(newCredentials.mcp_url, setCopiedMcpUrl)
                    }
                  >
                    {copiedMcpUrl ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  This is your own MCP server URL. You can also use other
                  developers&apos; URLs from the marketplace.
                </p>
              </div>

              {/* Instructions */}
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                  Configure in Claude Desktop:
                </p>
                <pre className="text-xs bg-blue-100 dark:bg-blue-900 p-3 rounded overflow-x-auto">
                  {`{
  "mcpServers": {
    "${newCredentials.client_id.split("_")[0]}": {
      "url": "${newCredentials.mcp_url}",
      "oauth": {
        "client_id": "${newCredentials.client_id}",
        "client_secret": "${newCredentials.client_secret}"
      }
    }
  }
}`}
                </pre>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() => {
                setShowCredentialsDialog(false);
                setNewCredentials(null);
                setShowClientSecret(false);
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke OAuth Client Confirmation Dialog */}
      <AlertDialog open={showRevokeDialog} onOpenChange={setShowRevokeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke OAuth Client?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke{" "}
              <strong>{clientToRevoke?.name}</strong>? This will invalidate all
              active sessions using this OAuth client. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowRevokeDialog(false);
                setClientToRevoke(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevokeOAuthClient}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ProtectedRoute>
  );
}
