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
import { EndpointService, Developer } from "@/services/endpointService";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  User,
  Package,
  AlertCircle,
  Copy,
  Check,
  ExternalLink,
  DollarSign,
} from "lucide-react";
import { API_BASE_URL } from "@/lib/api-config";

export default function Page() {
  const { accessToken, user } = useAuth();
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ totalDevelopers: 0, totalEndpoints: 0 });
  const [selectedDeveloper, setSelectedDeveloper] = useState<Developer | null>(
    null
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  useEffect(() => {
    const fetchMarketplace = async () => {
      if (!accessToken) return;

      try {
        setIsLoading(true);
        setError(null);
        const response = await EndpointService.getMarketplaceDevelopers(
          accessToken
        );

        if (response.success) {
          setDevelopers(response.developers);
          setStats({
            totalDevelopers: response.total_developers,
            totalEndpoints: response.total_endpoints,
          });
        }
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        setError(err.message || "Failed to load marketplace");
        console.warn("⚠️ Error fetching marketplace:", err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMarketplace();
  }, [accessToken]);

  const handleDeveloperClick = (developer: Developer) => {
    setSelectedDeveloper(developer);
    setIsDialogOpen(true);
    setCopiedUrl(false);
  };

  const getMcpUrl = (developerId: string) => {
    if (!user) return "";
    // OAuth-protected MCP URL format: /mcp/{developerId}
    // OAuth token will identify the user (no need for /user/{userId})
    return `${API_BASE_URL}/mcp/${developerId}`;
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch (err) {
      console.log("ℹ️ Failed to copy to clipboard:", err);
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
                <h1 className="text-xl font-semibold">Marketplace</h1>
                <p className="text-xs text-muted-foreground">
                  Browse developers and their endpoints
                </p>
              </div>
            </div>
          </header>

          <div className="flex flex-1 flex-col gap-4 p-4">
            {isLoading ? (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <Skeleton className="h-4 w-24" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-8 w-16" />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <Skeleton className="h-4 w-24" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-8 w-16" />
                    </CardContent>
                  </Card>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {[1, 2, 3].map((i) => (
                    <Card key={i}>
                      <CardHeader>
                        <Skeleton className="h-6 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                      </CardHeader>
                      <CardContent>
                        <Skeleton className="h-20 w-full" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            ) : error ? (
              <Card className="border-destructive">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                    <CardTitle className="text-destructive">
                      Error Loading Marketplace
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p>{error}</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Stats */}
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">
                        Total Developers
                      </CardTitle>
                      <User className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {stats.totalDevelopers}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Providing MCP endpoints
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">
                        Total Endpoints
                      </CardTitle>
                      <Package className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {stats.totalEndpoints}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Available in marketplace
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Developers List */}
                {developers.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <Package className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-lg font-medium">No developers found</p>
                      <p className="text-sm text-muted-foreground">
                        Be the first to create an endpoint!
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {developers.map((developer) => (
                      <Card
                        key={developer.id}
                        className="hover:shadow-lg transition-shadow cursor-pointer"
                        onClick={() => handleDeveloperClick(developer)}
                      >
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              <div className="bg-primary/10 p-2 rounded-full">
                                <User className="h-5 w-5 text-primary" />
                              </div>
                              <div>
                                <CardTitle className="text-lg">
                                  {developer.full_name ||
                                    developer.email.split("@")[0]}
                                </CardTitle>
                                <CardDescription className="text-xs">
                                  {developer.email}
                                </CardDescription>
                              </div>
                            </div>
                            <Badge variant="secondary">
                              {developer.endpoint_count}{" "}
                              {developer.endpoint_count === 1
                                ? "endpoint"
                                : "endpoints"}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            <p className="text-sm font-medium">
                              Available Endpoints:
                            </p>
                            <div className="space-y-1">
                              {developer.endpoints
                                .slice(0, 3)
                                .map((endpoint) => (
                                  <div
                                    key={endpoint.id}
                                    className="flex items-center gap-2 text-sm p-2 rounded bg-muted/50"
                                  >
                                    <Package className="h-3 w-3" />
                                    <span className="font-mono text-xs truncate flex-1">
                                      {endpoint.name}
                                    </span>
                                    <div className="flex items-center gap-1">
                                      <Badge
                                        variant="outline"
                                        className="text-xs"
                                      >
                                        {endpoint.method}
                                      </Badge>
                                      {endpoint.is_paid ? (
                                        <Badge
                                          variant="secondary"
                                          className="text-xs"
                                        >
                                          <DollarSign className="h-2 w-2 mr-1" />
                                          {endpoint.price_per_call_eth} SUI
                                        </Badge>
                                      ) : (
                                        <Badge
                                          variant="default"
                                          className="text-xs bg-green-500"
                                        >
                                          FREE
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              {developer.endpoint_count > 3 && (
                                <p className="text-xs text-muted-foreground text-center pt-1">
                                  +{developer.endpoint_count - 3} more
                                </p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>

      {/* Developer Details Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {selectedDeveloper?.full_name ||
                selectedDeveloper?.email.split("@")[0]}
            </DialogTitle>
            <DialogDescription>{selectedDeveloper?.email}</DialogDescription>
          </DialogHeader>

          {selectedDeveloper && (
            <div className="space-y-6">
              {/* MCP Connection URL */}
              <div className="space-y-2">
                <h3 className="font-semibold flex items-center gap-2">
                  <ExternalLink className="h-4 w-4" />
                  MCP Server URL
                </h3>
                <p className="text-sm text-muted-foreground">
                  Add this personalized URL to Claude Desktop to use{" "}
                  {selectedDeveloper.full_name ||
                    selectedDeveloper.email.split("@")[0]}
                  &apos;s tools:
                </p>
                <div className="flex gap-2">
                  <div className="flex-1 p-3 bg-muted rounded-lg font-mono text-sm break-all">
                    {getMcpUrl(selectedDeveloper.id)}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      copyToClipboard(getMcpUrl(selectedDeveloper.id))
                    }
                  >
                    {copiedUrl ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <div className="space-y-3">
                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm">
                    <p className="font-medium text-blue-900 dark:text-blue-100 mb-1">
                      🔵 For Claude Desktop:
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-blue-800 dark:text-blue-200">
                      <li>
                        Create OAuth credentials in your <strong>Wallet</strong>{" "}
                        page
                      </li>
                      <li>
                        Copy the{" "}
                        <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">
                          client_id
                        </code>{" "}
                        and{" "}
                        <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">
                          client_secret
                        </code>
                      </li>
                      <li>
                        Open Claude Desktop and go to Settings → Developer
                      </li>
                      <li>
                        Add new MCP server with the URL above and your OAuth
                        credentials
                      </li>
                      <li>
                        Restart Claude Desktop and authorize when prompted
                      </li>
                    </ol>
                  </div>

                  <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3 text-sm">
                    <p className="font-medium text-green-900 dark:text-green-100 mb-1">
                      🤖 For OpenAI / ChatGPT:
                    </p>
                    <p className="text-green-800 dark:text-green-200 mb-2 text-xs">
                      Uses Dynamic Client Registration (DCR) - easier setup!
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-green-800 dark:text-green-200">
                      <li>Just paste the MCP URL above in ChatGPT settings</li>
                      <li>OpenAI automatically handles authentication</li>
                      <li>Authorize when prompted - done!</li>
                    </ol>
                  </div>
                </div>
              </div>

              {/* Endpoints List */}
              <div className="space-y-2">
                <h3 className="font-semibold flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Available Endpoints ({selectedDeveloper.endpoint_count})
                </h3>
                <div className="space-y-2">
                  {selectedDeveloper.endpoints.map((endpoint) => (
                    <Card key={endpoint.id}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                              <code className="font-mono">{endpoint.name}</code>
                              <Badge variant="outline">{endpoint.method}</Badge>
                              {endpoint.is_paid ? (
                                <Badge variant="secondary" className="text-xs">
                                  <DollarSign className="h-3 w-3 mr-1" />
                                  {endpoint.price_per_call_eth} SUI per call
                                </Badge>
                              ) : (
                                <Badge
                                  variant="default"
                                  className="text-xs bg-green-500"
                                >
                                  FREE
                                </Badge>
                              )}
                            </CardTitle>
                            {endpoint.description && (
                              <CardDescription className="mt-1">
                                {endpoint.description}
                              </CardDescription>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">
                            Endpoint URL:
                          </p>
                          <code className="text-xs bg-muted p-2 rounded block break-all">
                            {endpoint.url}
                          </code>
                        </div>
                        {endpoint.is_paid &&
                          endpoint.developer_wallet_address && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">
                                Developer Wallet (Sui):
                              </p>
                              <code className="text-xs bg-muted p-2 rounded block break-all">
                                {endpoint.developer_wallet_address}
                              </code>
                              <p className="text-xs text-muted-foreground mt-1">
                                💰 SUI payments will be sent to this wallet
                                address
                              </p>
                            </div>
                          )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Usage Instructions */}
              <div className="bg-muted/50 border rounded-lg p-4 space-y-2">
                <h4 className="font-medium text-sm">Usage in Claude:</h4>
                <p className="text-sm text-muted-foreground">
                  Once you&apos;ve added this MCP server to Claude, you can use
                  these endpoints as tools in your conversations. For example:
                </p>
                <code className="block bg-background p-2 rounded text-xs">
                  &quot;Use the {selectedDeveloper.endpoints[0]?.name} tool
                  to...&quot;
                </code>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ProtectedRoute>
  );
}
