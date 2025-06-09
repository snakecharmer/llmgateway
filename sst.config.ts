/// <reference path="./.sst/platform/config.d.ts" />

/**
 * ## AWS Hono streaming
 *
 * An example on how to enable streaming for Lambda functions using Hono.
 *
 * ```ts title="sst.config.ts"
 * {
 *   streaming: true
 * }
 * ```
 *
 * While `sst dev` doesn't support streaming, we can conditionally enable it on deploy.
 *
 * ```ts title="index.ts"
 * export const handler = process.env.SST_LIVE ? handle(app) : streamHandle(app);
 * ```
 *
 * This will return the standard handler for `sst dev`.
 *
 * :::note
 * Streaming is currently not supported in `sst dev`.
 * :::
 *
 * To test this in your terminal, use the `curl` command with the `--no-buffer` option.
 *
 * ```bash "--no-buffer"
 * curl --no-buffer https://u3dyblk457ghskwbmzrbylpxoi0ayrbb.lambda-url.us-east-1.on.aws
 * ```
 *
 * Here we are using a Function URL directly because API Gateway doesn't support streaming.
 *
 */
export default $config({
    app(input) {
        return {
            name: "llmgateway",
            home: "aws",
            removal: input?.stage === "production" ? "retain" : "remove",
        };
    },
    async run() {
        const vpc = new sst.aws.Vpc("LlmGatewayVpc", {
            bastion: true,
            nat: "ec2", // Use NAT Gateway for production, or "ec2" for dev
        });
        const database = new sst.aws.Aurora("LlmGatewayDatabase", {
            engine: "postgres",
            vpc,
            proxy: true,
            // INFO: If you want to use with sst dev the local database, uncomment the dev config below
            // dev: {
            //     username: "postgres",
            //     password: "pw",
            //     database: "db",
            //     port: 5432
            // },
        });
        const DATABASE_URL = $interpolate`postgresql://${database.username}:${database.password}@${database.host}:${database.port}/${database.database}`;

        const redis = new sst.aws.Redis("LlmGwRedis", { vpc });
        const gw = new sst.aws.Function("LlmGw", {
            link: [database, redis],
            vpc,
            url: true,
            streaming: true,
            timeout: "15 minutes",
            handler: "apps/gateway/src/handler.handler",
            environment: {
                // # LLM Provider API Keys, enable only the ones you need
                OPENAI_API_KEY: "sk-svcacct-123",
                // ANTHROPIC_API_KEY: "sk-ant-123",
                // VERTEX_API_KEY: "vertex-123",
                // GOOGLE_AI_STUDIO_API_KEY: "google-123",
                // INFERENCE_NET_API_KEY: "inference-123",
                // KLUSTER_AI_API_KEY: "kluster-123",
                // TOGETHER_AI_API_KEY: "together-123",
                NODE_ENV: "production",
                DATABASE_URL: DATABASE_URL,
                REDIS_HOST: $interpolate`${redis.host}`,
                REDIS_PORT: $interpolate`${redis.port}`,
                REDIS_PASSWORD: $interpolate`${redis.password}`
            },
        });

        const llmGwApi = new sst.aws.Function("LlmGwApi", {
            link: [database, redis, gw],
            vpc,
            url: true,
            streaming: true,
            timeout: "15 minutes",
            handler: "apps/api/src/handler.handler",
            environment: {
                //UI_URL: web.url,
                NODE_ENV: "production",
                DATABASE_URL: DATABASE_URL
                // API_URL: api,
                // ORIGIN_URL: ${ORIGIN_URL:-http://localhost:3002},
                // PASSKEY_RP_ID: ${PASSKEY_RP_ID:-localhost},
                // PASSKEY_RP_NAME: ${PASSKEY_RP_NAME:-LLMGateway},
            },
        });

        const web = new sst.aws.StaticSite("LlmGwWeb", {
            path: "apps/ui",
            build: {
                output: "dist",
                command: "pnpm run build",
            },
            environment: {
                VITE_API_URL: $interpolate`${llmGwApi.url}/`,
                VITE_API: $interpolate`${llmGwApi.url}/`,
            },
        });

        new sst.x.DevCommand("migrate", {
            link: [database],
            environment: {
                AWS_PROFILE: "sts",
                DATABASE_URL: DATABASE_URL
            },
            dev: {
                command: `pnpm run migrate`,
                autostart: false,
            },
        });

        new sst.x.DevCommand("Studio", {
            link: [database],
            environment: {
                AWS_PROFILE: "sts",
                DATABASE_URL: $interpolate`postgres://${database.username}:${database.password}@${database.host}`,
            },
            dev: {
                directory: "packages/database",
                command: "cd packages/database && npx drizzle-kit studio",
                autostart: false,
            },
        });

        new sst.x.DevCommand("RedisCli", {
            link: [redis],
            dev: {
                command: $interpolate`npx redis-cli -h ${redis.host} -p ${redis.port} -a ${redis.password}`,
                autostart: false,
            },
        });

        return {
            web: web.url,
            gw: gw.url,
            api: llmGwApi.url,
        };
    },
});
