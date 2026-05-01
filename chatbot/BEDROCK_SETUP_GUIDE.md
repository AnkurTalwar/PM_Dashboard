# AWS Bedrock Chatbot Setup Guide

## Overview
This chatbot integrates AWS Bedrock with LangChain to provide an AI assistant for your Account Management Dashboard. The chatbot can answer questions about your data, explain metrics, and guide users through dashboard features.

## Prerequisites

1. **AWS Account**: You need an active AWS account with access to Amazon Bedrock
2. **Bedrock Model Access**: Request access to Claude models in your AWS console
   - Go to AWS Console → Bedrock → Model Access
   - Request access to: `anthropic.claude-3-sonnet-20240229-v1:0` (or other models)
   - Wait for approval (usually instant for most regions)
3. **AWS Credentials**: IAM user with Bedrock permissions

## Installation Steps

### Step 1: Install Required Packages

```bash
pip install -r bedrock_requirements.txt
```

Or install individually:
```bash
pip install streamlit boto3 langchain langchain-aws python-dotenv
```

### Step 2: Configure AWS Credentials

#### Option A: Using Environment Variables (Recommended)

Create a `.env` file in your project root:
```env
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
AWS_REGION=us-east-1
```

Then add to your script:
```python
from dotenv import load_dotenv
load_dotenv()
```

#### Option B: Using AWS CLI Configuration

Configure AWS CLI (credentials will be used automatically):
```bash
aws configure
```

#### Option C: Direct Configuration (Not Recommended for Production)

Edit `bedrock_chatbot.py` and fill in the credentials directly:
```python
AWS_ACCESS_KEY_ID = "YOUR_ACCESS_KEY"
AWS_SECRET_ACCESS_KEY = "YOUR_SECRET_KEY"
AWS_REGION = "us-east-1"
```

### Step 3: Request Bedrock Model Access

1. Login to AWS Console
2. Navigate to Amazon Bedrock service
3. Click on "Model access" in the left sidebar
4. Click "Enable specific models" or "Manage model access"
5. Select Claude 3 Sonnet (or other models you want to use)
6. Submit the request
7. Wait for approval (usually immediate)

### Step 4: Configure IAM Permissions

Your AWS user/role needs the following permissions:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "bedrock:InvokeModel",
                "bedrock:InvokeModelWithResponseStream"
            ],
            "Resource": "arn:aws:bedrock:*::foundation-model/*"
        }
    ]
}
```

## Usage

### Running as Standalone App

```bash
streamlit run bedrock_chatbot.py
```

### Integrating into Existing Dashboard

Add to your `7_Dashboard.py` file:

```python
# At the top of the file
from bedrock_chatbot import BedrockChatbot, render_chatbot_ui

# Somewhere in your dashboard, add a chatbot section
with st.expander("💬 Dashboard Assistant", expanded=False):
    render_chatbot_ui()
```

Or create a new page in your pages folder:
```bash
# Copy bedrock_chatbot.py to pages/8_AI_Assistant.py
cp bedrock_chatbot.py pages/8_AI_Assistant.py
```

## Configuration Options

### Model Selection

Available models (update `BEDROCK_MODEL_ID` in the script):

- `anthropic.claude-3-sonnet-20240229-v1:0` - Balanced performance (recommended)
- `anthropic.claude-3-haiku-20240307-v1:0` - Faster, more economical
- `anthropic.claude-v2` - Previous generation
- `amazon.titan-text-express-v1` - Amazon's model

### Model Parameters

Adjust in `MODEL_KWARGS`:

```python
MODEL_KWARGS = {
    "temperature": 0.7,     # 0.0 = deterministic, 1.0 = creative
    "top_p": 0.9,           # Nucleus sampling threshold
    "max_tokens": 2048,     # Maximum response length
}
```

## Troubleshooting

### Error: "Could not connect to endpoint"
- Check your AWS credentials are correct
- Verify your AWS region supports Bedrock
- Ensure you're using `bedrock-runtime` service

### Error: "AccessDeniedException"
- Request model access in Bedrock console
- Verify IAM permissions include `bedrock:InvokeModel`
- Check if the model ID is correct for your region

### Error: "ValidationException: The provided model identifier is invalid"
- Verify the model ID matches your region
- Check model access has been granted
- Try a different model ID

### Chatbot responses are slow
- Consider using `claude-3-haiku` for faster responses
- Reduce `max_tokens` parameter
- Check your internet connection and AWS region latency

## Cost Considerations

- Claude 3 Sonnet: ~$3 per million input tokens, ~$15 per million output tokens
- Claude 3 Haiku: ~$0.25 per million input tokens, ~$1.25 per million output tokens
- Monitor usage in AWS Billing Dashboard

## Security Best Practices

1. **Never commit credentials** to version control
2. Use environment variables or AWS IAM roles
3. Implement AWS Secrets Manager for production
4. Rotate access keys regularly
5. Use least-privilege IAM policies
6. Enable CloudTrail logging for audit

## Additional Resources

- [AWS Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [LangChain AWS Integration](https://python.langchain.com/docs/integrations/platforms/aws)
- [Streamlit Documentation](https://docs.streamlit.io/)

## Support

For issues or questions:
1. Check AWS Bedrock service status
2. Review CloudWatch logs for detailed errors
3. Verify all prerequisites are met
4. Test AWS credentials with AWS CLI: `aws bedrock list-foundation-models --region us-east-1`
