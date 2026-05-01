"""
AWS Bedrock Connection Test Script

This script helps you verify that your AWS credentials and Bedrock setup
are configured correctly before running the full chatbot.

Run this script first to troubleshoot any connection issues:
    python test_bedrock_connection.py
"""

import boto3
import os
from botocore.exceptions import ClientError, NoCredentialsError

# Configuration (same as bedrock_chatbot.py)
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID", "YOUR_AWS_ACCESS_KEY_ID_HERE")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "YOUR_AWS_SECRET_ACCESS_KEY_HERE")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
BEDROCK_MODEL_ID = "anthropic.claude-3-sonnet-20240229-v1:0"


def test_credentials():
    """Test if AWS credentials are configured."""
    print("\n" + "="*60)
    print("STEP 1: Testing AWS Credentials")
    print("="*60)
    
    if AWS_ACCESS_KEY_ID == "YOUR_AWS_ACCESS_KEY_ID_HERE":
        print("❌ AWS credentials not configured!")
        print("   Please set AWS_ACCESS_KEY_ID in environment variables or script")
        return False
    
    print(f"✓ AWS_ACCESS_KEY_ID is set: {AWS_ACCESS_KEY_ID[:10]}...")
    print(f"✓ AWS_SECRET_ACCESS_KEY is set: {'*' * 20}")
    print(f"✓ AWS_REGION: {AWS_REGION}")
    return True


def test_bedrock_access():
    """Test if we can access Bedrock service."""
    print("\n" + "="*60)
    print("STEP 2: Testing Bedrock Service Access")
    print("="*60)
    
    try:
        client = boto3.client(
            service_name='bedrock',
            region_name=AWS_REGION,
            aws_access_key_id=AWS_ACCESS_KEY_ID,
            aws_secret_access_key=AWS_SECRET_ACCESS_KEY
        )
        
        # Try to list foundation models
        response = client.list_foundation_models()
        print(f"✓ Successfully connected to Bedrock in {AWS_REGION}")
        print(f"✓ Found {len(response['modelSummaries'])} available models")
        return True, client
        
    except NoCredentialsError:
        print("❌ No AWS credentials found!")
        print("   Please configure your credentials")
        return False, None
        
    except ClientError as e:
        error_code = e.response['Error']['Code']
        if error_code == 'UnrecognizedClientException':
            print("❌ Invalid AWS credentials!")
            print("   Please check your Access Key and Secret Key")
        elif error_code == 'AccessDeniedException':
            print("❌ Access denied to Bedrock!")
            print("   Your IAM user/role needs bedrock:* permissions")
        else:
            print(f"❌ Error: {error_code}")
            print(f"   {e.response['Error']['Message']}")
        return False, None
        
    except Exception as e:
        print(f"❌ Unexpected error: {str(e)}")
        return False, None


def test_model_access(client):
    """Test if specific model is accessible."""
    print("\n" + "="*60)
    print("STEP 3: Testing Model Access")
    print("="*60)
    
    try:
        # List all models to see if our target model is available
        response = client.list_foundation_models()
        available_models = [m['modelId'] for m in response['modelSummaries']]
        
        print(f"Checking for model: {BEDROCK_MODEL_ID}")
        
        if BEDROCK_MODEL_ID in available_models:
            print(f"✓ Model {BEDROCK_MODEL_ID} is available!")
            return True
        else:
            print(f"❌ Model {BEDROCK_MODEL_ID} not found!")
            print("\nAvailable Claude models:")
            for model in available_models:
                if 'claude' in model.lower() or 'anthropic' in model.lower():
                    print(f"   - {model}")
            return False
            
    except Exception as e:
        print(f"❌ Error checking model access: {str(e)}")
        return False


def test_model_invocation():
    """Test if we can actually invoke the model."""
    print("\n" + "="*60)
    print("STEP 4: Testing Model Invocation")
    print("="*60)
    
    try:
        client = boto3.client(
            service_name='bedrock-runtime',
            region_name=AWS_REGION,
            aws_access_key_id=AWS_ACCESS_KEY_ID,
            aws_secret_access_key=AWS_SECRET_ACCESS_KEY
        )
        
        # Try a simple test message
        import json
        
        # Different payload formats for different models
        if 'claude' in BEDROCK_MODEL_ID:
            body = json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 100,
                "messages": [
                    {
                        "role": "user",
                        "content": "Hello! Please respond with 'Connection successful!'"
                    }
                ]
            })
        else:
            body = json.dumps({
                "inputText": "Hello! Please respond with 'Connection successful!'",
                "textGenerationConfig": {
                    "maxTokenCount": 100,
                    "temperature": 0.7
                }
            })
        
        response = client.invoke_model(
            modelId=BEDROCK_MODEL_ID,
            body=body
        )
        
        response_body = json.loads(response['body'].read())
        print("✓ Successfully invoked model!")
        print(f"✓ Model response received")
        
        # Extract and display the response text
        if 'claude' in BEDROCK_MODEL_ID:
            if 'content' in response_body:
                message = response_body['content'][0]['text']
                print(f"\nModel says: {message}")
        else:
            if 'results' in response_body:
                message = response_body['results'][0]['outputText']
                print(f"\nModel says: {message}")
        
        return True
        
    except ClientError as e:
        error_code = e.response['Error']['Code']
        if error_code == 'AccessDeniedException':
            print("❌ Model access denied!")
            print("   You need to request access to this model in the AWS Console:")
            print("   1. Go to AWS Console → Bedrock → Model Access")
            print("   2. Click 'Manage model access'")
            print("   3. Enable access for the Claude models")
            print("   4. Wait for approval (usually instant)")
        else:
            print(f"❌ Error: {error_code}")
            print(f"   {e.response['Error']['Message']}")
        return False
        
    except Exception as e:
        print(f"❌ Error invoking model: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Run all tests."""
    print("\n" + "="*60)
    print("AWS BEDROCK CONNECTION TEST")
    print("="*60)
    
    # Test 1: Credentials
    if not test_credentials():
        print("\n❌ TEST FAILED: Please configure your AWS credentials first")
        return
    
    # Test 2: Bedrock access
    success, client = test_bedrock_access()
    if not success:
        print("\n❌ TEST FAILED: Cannot access Bedrock service")
        return
    
    # Test 3: Model availability
    if not test_model_access(client):
        print("\n⚠️  WARNING: Target model may not be available")
        print("   The chatbot may not work. Check model access in AWS Console.")
    
    # Test 4: Model invocation
    if not test_model_invocation():
        print("\n❌ TEST FAILED: Cannot invoke model")
        print("   Please request model access in AWS Console")
        return
    
    # All tests passed!
    print("\n" + "="*60)
    print("✓ ALL TESTS PASSED!")
    print("="*60)
    print("\nYour Bedrock setup is working correctly!")
    print("You can now run the chatbot: streamlit run bedrock_chatbot.py")


if __name__ == "__main__":
    main()
