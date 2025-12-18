interface Config {
    env: string;
    port: number;
    database: {
        path: string;
        poolSize: number;
        poolTimeout: number;
    };
    jwt: {
        secret: string;
        expiry: string;
    };
    bcrypt: {
        rounds: number;
    };
    features: {
        chat: boolean;
        monitoring: boolean;
        debug: boolean;
    };
    logging: {
        level: string;
    };
}
declare const config: Config;
export default config;
