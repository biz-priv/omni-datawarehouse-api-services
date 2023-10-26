from src.shared.amazonPODHelperFiles.cognito import AWSSRP, AWSIDP
from requests_aws4auth import AWS4Auth

class CognitoAuth(object):
    def __init__(self, username, password, pool_id, identity_pool_id, client_id, provider, pool_region, service, service_region):
        self.username = username
        self.password = password
        self.pool_id = pool_id
        self.identity_pool_id = identity_pool_id
        self.client_id = client_id
        self.provider = provider
        self.pool_region = pool_region
        self.service = service
        self.service_region = service_region

    def get_auth(self):
        aws = AWSSRP(username=self.username, password=self.password, 
                     pool_id=self.pool_id, client_id=self.client_id, pool_region=self.pool_region)
        
        tokens = aws.authenticate_user()["AuthenticationResult"]
        print(f"Tokens: {tokens}")
        
        awsidp = AWSIDP(identity_pool_id=self.identity_pool_id, provider=self.provider, id_token=tokens['IdToken'], pool_region=self.pool_region)
        resp = awsidp.get_credentials();

        print(f"Credentials: {resp}")

        access_key_id=resp['access_key']
        secret_access_key=resp['secret_key']
        session_token = resp['session_token']

        return AWS4Auth(access_key_id, secret_access_key, self.service_region, self.service, session_token=session_token)