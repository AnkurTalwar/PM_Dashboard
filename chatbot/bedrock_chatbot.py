"""
AWS Bedrock Chatbot for Streamlit Dashboard
This script integrates AWS Bedrock with LangChain to provide a chatbot interface
for the Account Management Dashboard.

Installation Requirements:
pip install streamlit boto3 langchain langchain-aws

Usage:
1. Fill in the AWS credentials in the configuration section below
2. Run as a Streamlit app: streamlit run bedrock_chatbot.py
3. Or integrate the BedrockChatbot class into your existing dashboard
"""

import streamlit as st
import boto3
from langchain_aws import ChatBedrock
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.output_parsers import StrOutputParser
from langchain_core.messages import HumanMessage, AIMessage
import os
from typing import Optional, Dict, Any, List
import traceback

# ==================== CONFIGURATION PLACEHOLDERS ====================
# TODO: Fill in your AWS credentials and configuration

# Option 1: Use environment variables (recommended for production)
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID", "YOUR_AWS_ACCESS_KEY_ID_HERE")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "YOUR_AWS_SECRET_ACCESS_KEY_HERE")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")

# Option 2: Direct assignment (NOT recommended for production - use for testing only)
# Uncomment and fill in your credentials:
# AWS_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE"
# AWS_SECRET_ACCESS_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
# AWS_REGION = "us-east-1"

# Bedrock Model Configuration
# Available models: 
# - anthropic.claude-3-sonnet-20240229-v1:0 (recommended for balanced performance)
# - anthropic.claude-3-haiku-20240307-v1:0 (faster, more economical)
# - anthropic.claude-v2
# - amazon.titan-text-express-v1agreement
BEDROCK_MODEL_ID = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"

# Model parameters
MODEL_KWARGS = {
    "temperature": 0.7,
    # "top_p": 0.9,  # Removed: cannot specify both temperature and top_p for Claude models
    "max_tokens": 2048,
}

# ====================================================================


class BedrockChatbot:
    """Chatbot class that interfaces with AWS Bedrock using LangChain."""
    
    def __init__(self, model_id=BEDROCK_MODEL_ID, region=AWS_REGION,
                 aws_access_key_id=None, aws_secret_access_key=None):
        self.model_id = model_id
        self.region = region
        self.aws_access_key_id = aws_access_key_id or AWS_ACCESS_KEY_ID
        self.aws_secret_access_key = aws_secret_access_key or AWS_SECRET_ACCESS_KEY
        self.llm = None
        self.chain = None
        self.chat_history: List = []
        self._initialize_chatbot()
    
    def _initialize_chatbot(self):
        """Initialize the Bedrock client and LCEL chain."""
        try:
            bedrock_client = boto3.client(
                service_name="bedrock-runtime",
                region_name=self.region,
                aws_access_key_id=self.aws_access_key_id,
                aws_secret_access_key=self.aws_secret_access_key
            )
            
            self.llm = ChatBedrock(
                client=bedrock_client,
                model_id=self.model_id,
                model_kwargs=MODEL_KWARGS
            )
            
            system_preamble = (
                "You are a clear, concise AI assistant for an Account Management Dashboard with access to real-time calculated data. "
                "The dashboard tracks three key areas:\n\n"
                "1. HOURS RECONCILIATION: Forecasted vs Billed hours, Resource utilization, Flex flags (Y/N for budget flexibility), "
                "Billing violations (exceeding weekly hour limits), Active status, PTO projections, and discrepancies between forecasted and actual hours.\n\n"
                "2. LTA (Long Term Assignment) ANALYSIS: Hotel night tracking with 120-night compliance limit over rolling 12 months, "
                "Status levels (BREACH >120, WARNING 100-120, OK <100), nights dropping next month, and project assignments.\n\n"
                "3. EXPENSE COMPLIANCE: Policy violations tracked against these specific rules:\n"
                "   - Meals: $110/day max\n"
                "   - Lodging: $288/night max (post-tax)\n"
                "   - Airfare: $500 round trip max\n"
                "   - Weekly Total: $1,350/week max (excluding airfare)\n"
                "   - Submission: Within 21 days\n"
                "Policy violations are tracked by employee, category, date, amount, and overage. "
                "Weekly expense totals (excluding airfare) are monitored against the $1,350 threshold.\n\n"
                "You have access to COMPLETE EXPENSE DATA including ALL expense records (flights, meals, lodging, etc.) - not just violations. "
                "You also have access to CALCULATED DASHBOARD DATA including summary statistics, violations, discrepancies, and compliance metrics. "
                "When asked about 'all flights' or 'all meals', reference the COMPLETE EXPENSE RECORDS BY CATEGORY section which contains ALL expense records. "
                "When asked about violations specifically, reference the violation detail sections. "
                "Always reference specific numbers and details from the data context when answering questions. "
                "Be precise with metrics like forecasted hours, billed hours, utilization rates, hotel nights, violations, and financial amounts. "
                "When asked about violations, ALWAYS reference the employee names, counts, amounts, and specific details from the data context provided."
            )
            
            prompt = ChatPromptTemplate.from_messages(
                [
                    ("system", system_preamble),
                    MessagesPlaceholder("history"),
                    ("human", "{input}"),
                ]
            )
            
            self.chain = prompt | self.llm | StrOutputParser()
            
        except Exception as e:
            st.error(f"Failed to initialize chatbot: {str(e)}")
            st.error(traceback.format_exc())
            raise
    
    def chat(self, user_input, data_context=None):
        """Send a message and get a response with optional data context."""
        try:
            if not self.chain:
                raise ValueError("Chatbot not properly initialized")
            
            # Add data context to the user input if available
            enhanced_input = user_input
            if data_context:
                enhanced_input = f"""Data Context:
{data_context}

User Question: {user_input}

Please answer based on the data context provided above. Be specific and reference actual numbers from the data."""
            
            response = self.chain.invoke({
                "input": enhanced_input,
                "history": self.chat_history
            })
            
            # Update chat history with original user input (not the enhanced version)
            self.chat_history.append(HumanMessage(content=user_input))
            self.chat_history.append(AIMessage(content=response))
            
            return response
        except Exception as e:
            error_msg = f"Error generating response: {str(e)}"
            st.error(error_msg)
            return error_msg
    
    def reset_conversation(self):
        """Reset the conversation memory."""
        self.chat_history = []


def _format_data_context(dashboard_data):
    """Format dashboard data into a context string for the chatbot.
    
    Args:
        dashboard_data: Dictionary with keys like 'time_df', 'forecast_df', 'expense_df',
                       'summary_df', 'resource_violations', 'resource_discrepancies', 'lta_summary'
    
    Returns:
        Formatted string with data summary
    """
    import pandas as pd
    
    context_parts = []
    context_parts.append("=" * 60)
    context_parts.append("DASHBOARD DATA CONTEXT")
    context_parts.append("=" * 60)
    
    # === EXPENSE POLICY RULES ===
    context_parts.append("\n💼 EXPENSE POLICY RULES:")
    context_parts.append("These are the company expense policies that violations are checked against:")
    context_parts.append("\n1. GENERAL:")
    context_parts.append("   - Expenses must be submitted within 21 days of being incurred")
    context_parts.append("\n2. MEALS:")
    context_parts.append("   - Maximum: $110 per day (no receipts required)")
    context_parts.append("   - Meals can be ordered in hometown or during travel, within reason")
    context_parts.append("   - Reloading cards/accounts (Coffee/Food apps) NOT permitted")
    context_parts.append("\n3. LODGING:")
    context_parts.append("   - Maximum: $288 per night (post-tax)")
    context_parts.append("   - Hotel Wifi and Laundry are reimbursable for business purposes")
    context_parts.append("   - Room service/hotel meals can be on hotel folio if properly itemized")
    context_parts.append("\n4. GROUND TRANSPORTATION:")
    context_parts.append("   - Uber/Lyft rides should use KPMG linked accounts")
    context_parts.append("   - Rental cars require discussion with KPMG business lead")
    context_parts.append("\n5. AIRFARE:")
    context_parts.append("   - Maximum: $500 round trip")
    context_parts.append("   - Must be purchased minimum 6 days prior to travel")
    context_parts.append("   - Alternate travel permitted if approved by KPMG business lead")
    context_parts.append("   - Travel to destination should be ≤ travel to home city")
    context_parts.append("\n6. WEEKLY EXPENSE THRESHOLD:")
    context_parts.append("   - $1,350 per week (Sunday-Saturday, excluding airfare)")
    context_parts.append("")
    
    # === HOURS RECON DASHBOARD SUMMARY ===
    if 'summary_df' in dashboard_data and dashboard_data['summary_df'] is not None:
        summary_df = dashboard_data['summary_df']
        context_parts.append("\n📊 HOURS RECONCILIATION DASHBOARD:")
        context_parts.append(f"Total Resources: {len(summary_df)}")
        context_parts.append(f"Active Resources: {len(summary_df[summary_df['Active Status'] == 'Y'])}")
        context_parts.append(f"Rolled Off Resources: {len(summary_df[summary_df['Active Status'] == 'N'])}")
        
        # Overall metrics
        total_forecasted = summary_df['Forecasted Hours'].sum()
        total_billed = summary_df['Billed Hours'].sum()
        total_difference = summary_df['Hours Remaining Against Burn'].sum()
        
        context_parts.append(f"\nOverall Hours Summary:")
        context_parts.append(f"  Total Forecasted Hours: {total_forecasted:,.0f}")
        context_parts.append(f"  Total Billed Hours: {total_billed:,.0f}")
        context_parts.append(f"  Total Hours Remaining: {total_difference:,.0f}")
        context_parts.append(f"  Utilization Rate: {(total_billed/total_forecasted*100):.1f}%" if total_forecasted > 0 else "  Utilization Rate: N/A")
        
        # Flex Flag breakdown
        flex_yes = len(summary_df[summary_df['Flex Flag'] == 'Y'])
        flex_no = len(summary_df[summary_df['Flex Flag'] == 'N'])
        context_parts.append(f"\nFlex Flag Status:")
        context_parts.append(f"  Resources with flexibility (Y): {flex_yes}")
        context_parts.append(f"  Resources without flexibility (N): {flex_no}")
        
        # Billing Violations
        violations_yes = len(summary_df[summary_df['Billing Violation'] == 'Y'])
        context_parts.append(f"\nBilling Violations:")
        context_parts.append(f"  Resources with violations: {violations_yes}")
        
        # By Project
        if 'Project' in summary_df.columns:
            project_summary = summary_df.groupby('Project').agg({
                'Forecasted Hours': 'sum',
                'Billed Hours': 'sum',
                'Hours Remaining Against Burn': 'sum'
            }).sort_values('Billed Hours', ascending=False)
            
            context_parts.append(f"\nBy Project:")
            for proj, row in project_summary.iterrows():
                util = (row['Billed Hours']/row['Forecasted Hours']*100) if row['Forecasted Hours'] > 0 else 0
                context_parts.append(f"  {proj}: Forecasted={row['Forecasted Hours']:,.0f}, Billed={row['Billed Hours']:,.0f}, Remaining={row['Hours Remaining Against Burn']:,.0f}, Util={util:.1f}%")
        
        # Individual resource details (top 20 by billed hours)
        context_parts.append(f"\nTop 20 Resources by Billed Hours:")
        top_resources = summary_df.nlargest(20, 'Billed Hours')
        for idx, row in top_resources.iterrows():
            resource_name = str(row.get('Resource', 'Unknown'))
            proj = row.get('Project', 'N/A')
            level = row.get('Level', 'N/A')
            forecasted = row.get('Forecasted Hours', 0)
            billed = row.get('Billed Hours', 0)
            remaining = row.get('Hours Remaining Against Burn', 0)
            flex = row.get('Flex Flag', 'N/A')
            violation = row.get('Billing Violation', 'N/A')
            active = row.get('Active Status', 'N/A')
            context_parts.append(f"  • {resource_name} ({level}) - {proj}: Forecasted={forecasted:,.0f}h, Billed={billed:,.0f}h, Remaining={remaining:,.0f}h, Flex={flex}, Violation={violation}, Active={active}")
    
    # === BILLING VIOLATIONS DETAILS ===
    if 'resource_violations' in dashboard_data and dashboard_data['resource_violations']:
        resource_violations = dashboard_data['resource_violations']
        context_parts.append(f"\n🚨 BILLING VIOLATIONS DETAILS:")
        context_parts.append(f"Resources with weekly hour violations: {len(resource_violations)}")
        context_parts.append("(Associates/Contractors: 45 hrs/week limit, Managers/Directors: 40 hrs/week limit)")
        
        for resource_name, violation_weeks in resource_violations.items():
            context_parts.append(f"\n  {resource_name}:")
            for week_date, billed, limit in violation_weeks:
                overage = billed - limit
                context_parts.append(f"    Week {week_date.strftime('%m/%d/%Y')}: Billed {billed:.0f}h (Limit: {limit:.0f}h) - OVER by {overage:.0f}h")
    
    # === DISCREPANCIES DETAILS ===
    if 'resource_discrepancies' in dashboard_data and dashboard_data['resource_discrepancies']:
        resource_discrepancies = dashboard_data['resource_discrepancies']
        context_parts.append(f"\n⚠️ FORECAST DISCREPANCIES:")
        context_parts.append(f"Resources with weeks where they billed hours but had no forecasted hours: {len(resource_discrepancies)}")
        
        for resource_name, discrepancy_weeks in resource_discrepancies.items():
            context_parts.append(f"\n  {resource_name}:")
            total_billed_no_forecast = sum(billed for _, _, billed in discrepancy_weeks)
            context_parts.append(f"    Total weeks with discrepancies: {len(discrepancy_weeks)}")
            context_parts.append(f"    Total hours billed without forecast: {total_billed_no_forecast:.0f}h")
            for week_date, forecasted, billed in discrepancy_weeks:
                context_parts.append(f"      Week {week_date.strftime('%m/%d/%Y')}: Forecasted={forecasted:.0f}h, Billed={billed:.0f}h")
    
    # === LTA ANALYSIS ===
    if 'lta_summary' in dashboard_data and dashboard_data['lta_summary'] is not None:
        lta_df = dashboard_data['lta_summary']
        context_parts.append(f"\n🏨 LTA (LONG TERM ASSIGNMENT) ANALYSIS:")
        context_parts.append(f"Total resources with hotel stays: {len(lta_df)}")
        context_parts.append(f"LTA Compliance Limit: 120 nights in rolling 12 months")
        
        # Status breakdown
        breach_count = len(lta_df[lta_df['Status'] == '🚨 BREACH'])
        warning_count = len(lta_df[lta_df['Status'] == '⚠️ WARNING'])
        ok_count = len(lta_df[lta_df['Status'] == '✅ OK'])
        
        context_parts.append(f"\nLTA Status Breakdown:")
        context_parts.append(f"  🚨 BREACH (>120 nights): {breach_count} resources")
        context_parts.append(f"  ⚠️ WARNING (100-120 nights): {warning_count} resources")
        context_parts.append(f"  ✅ OK (<100 nights): {ok_count} resources")
        
        total_nights = lta_df['Hotel Nights (Last 12 Months)'].sum()
        context_parts.append(f"\nTotal Hotel Nights (All Resources): {total_nights:,.0f}")
        
        # Top resources by hotel nights
        context_parts.append(f"\nTop Resources by Hotel Nights:")
        top_lta = lta_df.nlargest(15, 'Hotel Nights (Last 12 Months)')
        for idx, row in top_lta.iterrows():
            emp = row.get('Employee Name', 'Unknown')
            nights = row.get('Hotel Nights (Last 12 Months)', 0)
            status = row.get('Status', 'N/A')
            proj = row.get('Project', 'N/A')
            nights_drop = row.get('Nights Drop Next Month', 0)
            context_parts.append(f"  • {emp} ({proj}): {nights} nights - {status} (Drops next month: {nights_drop})")
    
    # === EXPENSE COMPLIANCE ANALYSIS ===
    if 'expense_compliance' in dashboard_data and dashboard_data['expense_compliance'] is not None and len(dashboard_data['expense_compliance']) > 0:
        expense_comp_df = dashboard_data['expense_compliance']
        context_parts.append(f"\n💳 EXPENSE POLICY COMPLIANCE:")
        context_parts.append(f"Total Expense Records: {len(expense_comp_df)}")
        
        # Compliance metrics
        total_compliant = expense_comp_df['Compliant'].sum()
        total_violations = len(expense_comp_df) - total_compliant
        compliance_rate = (total_compliant / len(expense_comp_df) * 100) if len(expense_comp_df) > 0 else 0
        
        context_parts.append(f"\nCompliance Summary:")
        context_parts.append(f"  Compliant Expenses: {total_compliant:,}")
        context_parts.append(f"  Policy Violations: {total_violations:,}")
        context_parts.append(f"  Compliance Rate: {compliance_rate:.1f}%")
        
        # Violations by category
        violations_only = expense_comp_df[expense_comp_df['Compliant'] == False]
        if len(violations_only) > 0:
            context_parts.append(f"\nViolations by Category:")
            category_violations = violations_only['Category'].value_counts()
            for cat, count in category_violations.items():
                context_parts.append(f"  {cat}: {count} violations")
    
    # === EXPENSE VIOLATIONS DETAIL ===
    if 'expense_violations_detail' in dashboard_data and dashboard_data['expense_violations_detail'] is not None and len(dashboard_data['expense_violations_detail']) > 0:
        violations_detail = dashboard_data['expense_violations_detail']
        context_parts.append(f"\n🚨 DETAILED EXPENSE VIOLATIONS:")
        context_parts.append(f"Total Policy Violations: {len(violations_detail)}")
        
        # Group by employee to show violations per person
        emp_violations = violations_detail.groupby('Employee').agg({
            'Amount': 'sum',
            'Overage': 'sum',
            'Rule Violated': 'count'
        }).rename(columns={'Rule Violated': 'Violation Count'})
        emp_violations = emp_violations.sort_values('Violation Count', ascending=False)
        
        unique_violators = len(emp_violations)
        context_parts.append(f"Unique Employees with Violations: {unique_violators}")
        context_parts.append(f"\n=== ANSWER KEY: Which employees have the most expense policy violations? ===")
        context_parts.append(f"The following {min(20, len(emp_violations))} employees have the most violations:")
        context_parts.append(f"\nViolations by Employee (Ranked Top 20):")
        for rank, (emp, row) in enumerate(emp_violations.head(20).iterrows(), 1):
            violation_count = int(row['Violation Count'])
            total_amount = row['Amount']
            total_overage = row['Overage']
            context_parts.append(f"  {rank}. {emp}: {violation_count} violations, Total Spent: ${total_amount:,.2f}, Total Overage: ${total_overage:,.2f}")
        
        # Show specific violation details for top violators
        context_parts.append(f"\n=== DETAILED BREAKDOWN OF TOP 10 VIOLATORS ===")
        top_violators = emp_violations.head(10).index.tolist()
        for rank, emp in enumerate(top_violators, 1):
            emp_detail = violations_detail[violations_detail['Employee'] == emp]
            violation_count = len(emp_detail)
            total_amt = emp_detail['Amount'].sum()
            total_over = emp_detail['Overage'].sum()
            
            context_parts.append(f"\n  {rank}. {emp} - {violation_count} total violations (Total: ${total_amt:,.2f}, Overage: ${total_over:,.2f}):")
            
            # Breakdown by category for this employee
            cat_breakdown = emp_detail.groupby('Category').size()
            context_parts.append(f"     Categories: {', '.join([f'{cat}({count})' for cat, count in cat_breakdown.items()])}")
            
            # Vendor/Merchant breakdown for this employee (from Additional Details only)
            if 'Additional Details' in emp_detail.columns and emp_detail['Additional Details'].notna().any():
                # Extract vendor information from Additional Details
                vendor_list = []
                for details in emp_detail['Additional Details'].dropna():
                    details_str = str(details).lower()
                    if 'vendor:' in details_str:
                        # Extract text after "vendor:"
                        vendor_part = details_str.split('vendor:')[1].split('|')[0].strip()
                        if vendor_part:
                            vendor_list.append(vendor_part)
                
                if vendor_list:
                    vendor_counts = pd.Series(vendor_list).value_counts()
                    top_vendors = vendor_counts.head(5)
                    context_parts.append(f"     Top Vendors (from Additional Details): {', '.join([f'{vendor}({count})' for vendor, count in top_vendors.items()])}")
            
            # Show first 10 specific violations
            for idx, viol in emp_detail.head(10).iterrows():
                proj = viol.get('Project', 'N/A')
                date = viol.get('Date', 'N/A')
                category = viol.get('Category', 'N/A')
                amount = viol.get('Amount', 0)
                rule = viol.get('Rule Violated', 'N/A')
                limit = viol.get('Policy Limit', 0)
                overage = viol.get('Overage', 0)
                additional_details = viol.get('Additional Details', '')
                
                # Build vendor info string - ONLY from Additional Details
                vendor_info = ""
                if additional_details and str(additional_details).strip():
                    vendor_info = f" | Additional Details: {additional_details}"
                
                context_parts.append(f"     • {date} ({proj}): {category} ${amount:,.2f} - Violated: {rule} (Limit: ${limit:,.2f}, Over: ${overage:,.2f}){vendor_info}")
            
            if violation_count > 10:
                context_parts.append(f"     ... and {violation_count - 10} more violations")
        
        # Add vendor/merchant summary analysis across all violations (from Additional Details)
        if 'Additional Details' in violations_detail.columns and violations_detail['Additional Details'].notna().any():
            context_parts.append(f"\n=== VENDOR/MERCHANT ANALYSIS (ALL VIOLATIONS) ===")
            
            # Extract all vendors from Additional Details
            all_vendors_list = []
            for details in violations_detail['Additional Details'].dropna():
                details_str = str(details).lower()
                if 'vendor:' in details_str:
                    # Extract text after "vendor:"
                    vendor_part = details_str.split('vendor:')[1].split('|')[0].strip()
                    if vendor_part:
                        all_vendors_list.append(vendor_part)
            
            if all_vendors_list:
                # Overall top vendors
                all_vendors = pd.Series(all_vendors_list).value_counts()
                context_parts.append(f"\nTop 15 Vendors Across All Violations (from Additional Details):")
                for rank, (vendor, count) in enumerate(all_vendors.head(15).items(), 1):
                    context_parts.append(f"  {rank}. {vendor}: {count} violations")
                
                # Vendors by category
                for category in ['Lodging', 'Meals', 'Airfare', 'Ground Transportation']:
                    cat_violations = violations_detail[violations_detail['Category'] == category]
                    if len(cat_violations) > 0:
                        cat_vendors_list = []
                        for details in cat_violations['Additional Details'].dropna():
                            details_str = str(details).lower()
                            if 'vendor:' in details_str:
                                vendor_part = details_str.split('vendor:')[1].split('|')[0].strip()
                                if vendor_part:
                                    cat_vendors_list.append(vendor_part)
                        
                        if cat_vendors_list:
                            cat_vendors = pd.Series(cat_vendors_list).value_counts()
                            context_parts.append(f"\nTop {category} Vendors (from Additional Details):")
                            for vendor, count in cat_vendors.head(10).items():
                                context_parts.append(f"  • {vendor}: {count} {category.lower()} violations")
    
    # === WEEKLY EXPENSE SUMMARY ===
    if 'expense_weekly_summary' in dashboard_data and dashboard_data['expense_weekly_summary'] is not None and len(dashboard_data['expense_weekly_summary']) > 0:
        weekly_summary = dashboard_data['expense_weekly_summary']
        context_parts.append(f"\n📅 WEEKLY EXPENSE TOTALS (Excluding Airfare):")
        context_parts.append(f"Weekly Threshold: $1,350")
        
        # Overall weekly metrics
        weeks_over_threshold = len(weekly_summary[weekly_summary['Exceeds_Threshold']])
        total_weeks = len(weekly_summary)
        
        context_parts.append(f"\nWeekly Summary:")
        context_parts.append(f"  Total Employee-Weeks: {total_weeks:,}")
        context_parts.append(f"  Weeks Over Threshold: {weeks_over_threshold:,}")
        context_parts.append(f"  Weeks Under Threshold: {total_weeks - weeks_over_threshold:,}")
        
        # Employees exceeding threshold
        emp_over_threshold = weekly_summary[weekly_summary['Exceeds_Threshold']].groupby('Employee').agg({
            'Weekly_Total': 'sum',
            'Overage': 'sum',
            'Week_Range': 'count'
        }).rename(columns={'Week_Range': 'Weeks Over'})
        emp_over_threshold = emp_over_threshold.sort_values('Weeks Over', ascending=False)
        
        if len(emp_over_threshold) > 0:
            context_parts.append(f"\nEmployees with Weeks Over $1,350 Threshold:")
            for emp, row in emp_over_threshold.head(20).iterrows():
                weeks_count = int(row['Weeks Over'])
                total_spend = row['Weekly_Total']
                total_overage = row['Overage']
                context_parts.append(f"  • {emp}: {weeks_count} weeks over, Total: ${total_spend:,.2f}, Total Overage: ${total_overage:,.2f}")
            
            # Show weekly details for top threshold violators
            context_parts.append(f"\nWeekly Details for Top Threshold Violators (with vendor information):")
            top_emp = emp_over_threshold.head(10).index.tolist()
            for emp in top_emp:
                emp_weeks = weekly_summary[(weekly_summary['Employee'] == emp) & (weekly_summary['Exceeds_Threshold'])]
                emp_weeks = emp_weeks.sort_values('Weekly_Total', ascending=False)
                context_parts.append(f"\n  {emp}:")
                for idx, week in emp_weeks.iterrows():
                    week_range = week['Week_Range']
                    weekly_total = week['Weekly_Total']
                    overage = week['Overage']
                    
                    # Add Additional Details if available
                    additional_info = ""
                    if 'Additional Details' in week.index and pd.notna(week['Additional Details']) and str(week['Additional Details']).strip():
                        additional_details = str(week['Additional Details'])
                        additional_info = f"\n      Additional Details: {additional_details}"
                    
                    context_parts.append(f"    {week_range}: ${weekly_total:,.2f} (Over by ${overage:,.2f}){additional_info}")
        else:
            context_parts.append(f"\n✅ No employees exceeded the $1,350 weekly threshold!")
    
    # Also include ALL weekly expenses for top employees (not just over threshold)
    if 'expense_weekly_summary' in dashboard_data and dashboard_data['expense_weekly_summary'] is not None and len(dashboard_data['expense_weekly_summary']) > 0:
        weekly_summary = dashboard_data['expense_weekly_summary']
        context_parts.append(f"\n=== COMPLETE WEEKLY EXPENSE BREAKDOWN (Top 10 Employees by Total Spend) ===")
        
        # Get top employees by total weekly spend
        top_spenders = weekly_summary.groupby('Employee')['Weekly_Total'].sum().sort_values(ascending=False).head(10).index.tolist()
        
        for emp in top_spenders:
            emp_weeks_all = weekly_summary[weekly_summary['Employee'] == emp].sort_values('Weekly_Total', ascending=False)
            total_all_weeks = emp_weeks_all['Weekly_Total'].sum()
            context_parts.append(f"\n{emp} - Total Spend: ${total_all_weeks:,.2f} across {len(emp_weeks_all)} weeks:")
            
            # Show top 5 most expensive weeks for this employee
            for idx, week in emp_weeks_all.head(5).iterrows():
                week_range = week['Week_Range']
                weekly_total = week['Weekly_Total']
                threshold_status = " ⚠️ OVER THRESHOLD" if week.get('Exceeds_Threshold', False) else ""
                
                # Add Additional Details if available
                additional_info = ""
                if 'Additional Details' in week.index and pd.notna(week['Additional Details']) and str(week['Additional Details']).strip():
                    additional_details = str(week['Additional Details'])
                    additional_info = f"\n    Additional Details: {additional_details}"
                
                context_parts.append(f"  {week_range}: ${weekly_total:,.2f}{threshold_status}{additional_info}")
    
    # Time data summary
    if 'time_df' in dashboard_data and dashboard_data['time_df'] is not None:
        time_df = dashboard_data['time_df']
        context_parts.append("\n📊 TIME & HOURS DATA:")
        context_parts.append(f"Total time entries: {len(time_df)}")
        
        # Find employee name column (flexible matching)
        emp_col = None
        for col in time_df.columns:
            if 'employee' in str(col).lower() and 'name' in str(col).lower():
                emp_col = col
                break
        
        # Find hours column
        hours_col = None
        for col in time_df.columns:
            if str(col).lower() in ['hours', 'hrs', 'time']:
                hours_col = col
                break
        
        # Find engagement column
        eng_col = None
        for col in time_df.columns:
            col_lower = str(col).lower()
            if 'eng' in col_lower and 'description' in col_lower:
                eng_col = col
                break
        
        # Find staff level column
        level_col = None
        for col in time_df.columns:
            if 'staff' in str(col).lower() and 'level' in str(col).lower():
                level_col = col
                break
        
        if emp_col and hours_col:
            emp_hours = time_df.groupby(emp_col)[hours_col].sum().sort_values(ascending=False)
            context_parts.append(f"\nUnique employees: {len(emp_hours)}")
            context_parts.append(f"Total hours logged: {time_df[hours_col].sum():,.2f}")
            context_parts.append(f"\nALL EMPLOYEES - Hours Summary:")
            for emp, hrs in emp_hours.items():
                context_parts.append(f"  • {emp}: {hrs:,.2f} hours")
        
        if eng_col and hours_col:
            eng_hours = time_df.groupby(eng_col)[hours_col].sum().sort_values(ascending=False)
            context_parts.append(f"\nTop 10 Engagements by Hours:")
            for i, (eng, hrs) in enumerate(eng_hours.head(10).items(), 1):
                context_parts.append(f"  {i}. {eng}: {hrs:,.2f} hours")
        
        context_parts.append("")
    
    # Expense data summary
    if 'expense_df' in dashboard_data and dashboard_data['expense_df'] is not None:
        expense_df = dashboard_data['expense_df'].copy()
        context_parts.append("\n💰 EXPENSE DATA:")
        context_parts.append(f"Total expense records: {len(expense_df)}")
        
        # Find employee column (flexible matching)
        emp_col = None
        for col in expense_df.columns:
            col_lower = str(col).lower()
            if 'employee' in col_lower and 'name' in col_lower:
                emp_col = col
                break
        
        # Find amount column (flexible matching)
        amount_col = None
        for col in expense_df.columns:
            col_lower = str(col).lower()
            if 'amount' in col_lower or 'total' in col_lower or 'cost' in col_lower:
                amount_col = col
                break
        
        # Find work date or week ending column
        date_col = None
        for col in expense_df.columns:
            col_lower = str(col).lower()
            if 'work' in col_lower and 'date' in col_lower:
                date_col = col
                break
            elif 'week' in col_lower and 'ending' in col_lower:
                date_col = col
                break
        
        # Find expense type column
        type_col = None
        for col in expense_df.columns:
            col_lower = str(col).lower()
            if 'expense' in col_lower and 'type' in col_lower:
                type_col = col
                break
        
        if amount_col:
            # Convert to numeric, coercing errors
            expense_df[amount_col] = pd.to_numeric(expense_df[amount_col], errors='coerce')
            total_expenses = expense_df[amount_col].sum()
            avg_expense = expense_df[amount_col].mean()
            context_parts.append(f"Total expense amount: ${total_expenses:,.2f}")
            context_parts.append(f"Average expense per record: ${avg_expense:,.2f}")
        
        # ALL EMPLOYEES with expenses
        if emp_col and amount_col:
            emp_expenses = expense_df.groupby(emp_col)[amount_col].sum().sort_values(ascending=False)
            context_parts.append(f"\nUnique employees with expenses: {len(emp_expenses)}")
            context_parts.append(f"\nALL EMPLOYEES - Total Expense Summary:")
            for emp, amt in emp_expenses.items():
                count = expense_df[expense_df[emp_col] == emp].shape[0]
                context_parts.append(f"  • {emp}: ${amt:,.2f} ({count} transactions)")
        
        # Weekly breakdown by employee (detailed)
        if emp_col and amount_col and date_col:
            try:
                expense_df[date_col] = pd.to_datetime(expense_df[date_col], errors='coerce')
                # Remove rows with invalid dates
                expense_df_valid = expense_df[expense_df[date_col].notna()].copy()
                expense_df_valid['Week_Ending'] = expense_df_valid[date_col].dt.to_period('W').dt.end_time
                
                context_parts.append(f"\n📅 DETAILED WEEKLY EXPENSE BREAKDOWN BY EMPLOYEE:")
                context_parts.append(f"(Weekly threshold for violations: $500)")
                
                # Group by employee and week
                weekly_emp = expense_df_valid.groupby([emp_col, 'Week_Ending'])[amount_col].sum().reset_index()
                weekly_emp = weekly_emp.sort_values([emp_col, 'Week_Ending'])
                
                # Get all unique employees with expenses
                all_employees = weekly_emp[emp_col].unique()
                
                for emp in all_employees:
                    emp_data = weekly_emp[weekly_emp[emp_col] == emp].copy()
                    emp_data = emp_data.sort_values(amount_col, ascending=False)  # Sort by amount descending
                    
                    context_parts.append(f"\n{emp} - Weekly Expenses:")
                    
                    # Show all weeks with amounts
                    for idx, row in emp_data.iterrows():
                        week_str = row['Week_Ending'].strftime('%Y-%m-%d')
                        amount = row[amount_col]
                        violation = " ⚠️ VIOLATION" if amount > 500 else ""
                        context_parts.append(f"  Week ending {week_str}: ${amount:,.2f}{violation}")
                    
                    # Add summary stats for this employee
                    total_weeks = len(emp_data)
                    violations = emp_data[emp_data[amount_col] > 500]
                    num_violations = len(violations)
                    max_week_amount = emp_data[amount_col].max()
                    max_week_date = emp_data.loc[emp_data[amount_col].idxmax(), 'Week_Ending'].strftime('%Y-%m-%d')
                    avg_weekly = emp_data[amount_col].mean()
                    
                    context_parts.append(f"  Summary: {total_weeks} weeks total, {num_violations} violations, Most expensive week: {max_week_date} (${max_week_amount:,.2f}), Avg: ${avg_weekly:,.2f}/week")
                
            except Exception as e:
                context_parts.append(f"\n⚠️ Could not generate weekly breakdown: {str(e)}")
        
        if type_col and amount_col:
            type_expenses = expense_df.groupby(type_col)[amount_col].sum().sort_values(ascending=False)
            context_parts.append(f"\n\nExpense by Type:")
            for exp_type, amt in type_expenses.head(10).items():
                count = expense_df[expense_df[type_col] == exp_type].shape[0]
                context_parts.append(f"  • {exp_type}: ${amt:,.2f} ({count} transactions)")
        
        # === DETAILED EXPENSE RECORDS BY CATEGORY ===
        # This section provides ALL expense records by major categories to answer queries like "show all flights"
        context_parts.append(f"\n=== COMPLETE EXPENSE RECORDS BY CATEGORY ===")
        context_parts.append("This section contains ALL expense records (BOTH compliant AND violations) by category.")
        context_parts.append("Use this data to answer questions about all flights, meals, hotels, etc.")
        context_parts.append("Each expense shows whether it complies with policy or violates it.\n")
        
        # Find category column (may be labeled differently)
        category_col = None
        for col in expense_df.columns:
            col_lower = str(col).lower()
            if col == 'Category' or 'category' in col_lower or ('expense' in col_lower and 'type' in col_lower):
                category_col = col
                break
        
        # Find compliant column
        compliant_col = None
        for col in expense_df.columns:
            if col == 'Compliant' or 'compliant' in str(col).lower():
                compliant_col = col
                break
        
        # Find vendor/merchant/description column
        vendor_col = None
        for col in expense_df.columns:
            col_lower = str(col).lower()
            if 'vendor' in col_lower or 'merchant' in col_lower or 'description' in col_lower:
                vendor_col = col
                break
        
        # Find project column
        project_col = None
        for col in expense_df.columns:
            col_lower = str(col).lower()
            if 'project' in col_lower or 'engagement' in col_lower:
                project_col = col
                break
        
        if category_col and emp_col and amount_col and date_col:
            # Define major expense categories to detail
            major_categories = ['Airfare', 'Lodging', 'Meals', 'Ground Transportation', 'Car Rental']
            
            for category in major_categories:
                # Find all expenses matching this category (case-insensitive partial match)
                category_mask = expense_df[category_col].astype(str).str.contains(category, case=False, na=False)
                category_expenses = expense_df[category_mask].copy()
                
                if len(category_expenses) > 0:
                    total_cat_amount = category_expenses[amount_col].sum()
                    
                    # Count compliant vs violations
                    if compliant_col:
                        compliant_count = category_expenses[compliant_col].sum() if compliant_col in category_expenses.columns else len(category_expenses)
                        violation_count = len(category_expenses) - compliant_count
                        context_parts.append(f"\n📋 ALL {category.upper()} EXPENSES ({len(category_expenses)} total: {compliant_count} compliant, {violation_count} violations, Total: ${total_cat_amount:,.2f}):")
                    else:
                        context_parts.append(f"\n📋 ALL {category.upper()} EXPENSES ({len(category_expenses)} records, Total: ${total_cat_amount:,.2f}):")
                    
                    # Sort by date (most recent first) or amount (highest first)
                    if date_col in category_expenses.columns:
                        category_expenses = category_expenses.sort_values(date_col, ascending=False)
                    else:
                        category_expenses = category_expenses.sort_values(amount_col, ascending=False)
                    
                    # Show details for each expense (limit to 100 records per category to avoid token overflow)
                    display_limit = min(100, len(category_expenses))
                    for idx, row in category_expenses.head(display_limit).iterrows():
                        employee = row.get(emp_col, 'Unknown')
                        amount = row.get(amount_col, 0)
                        date_val = row.get(date_col, 'N/A')
                        
                        # Format date
                        try:
                            if pd.notna(date_val):
                                date_str = pd.to_datetime(date_val).strftime('%Y-%m-%d')
                            else:
                                date_str = 'N/A'
                        except:
                            date_str = str(date_val)
                        
                        # Check if compliant
                        compliance_status = ""
                        if compliant_col and compliant_col in row.index:
                            is_compliant = row[compliant_col]
                            compliance_status = " ✅ COMPLIANT" if is_compliant else " ❌ VIOLATION"
                        
                        # Build detail string
                        detail_parts = [f"{employee}", f"${amount:,.2f}", f"Date: {date_str}"]
                        
                        # Add vendor if available
                        if vendor_col and vendor_col in row.index and pd.notna(row[vendor_col]):
                            vendor = str(row[vendor_col])[:50]  # Truncate long vendor names
                            detail_parts.append(f"Vendor: {vendor}")
                        
                        # Add project if available
                        if project_col and project_col in row.index and pd.notna(row[project_col]):
                            project = str(row[project_col])[:30]
                            detail_parts.append(f"Project: {project}")
                        
                        context_parts.append(f"  • {' | '.join(detail_parts)}{compliance_status}")
                    
                    if len(category_expenses) > display_limit:
                        context_parts.append(f"  ... and {len(category_expenses) - display_limit} more {category.lower()} expenses")
                    
                    # Summary stats for this category
                    avg_amount = category_expenses[amount_col].mean()
                    max_amount = category_expenses[amount_col].max()
                    unique_employees = category_expenses[emp_col].nunique() if emp_col in category_expenses.columns else 0
                    
                    context_parts.append(f"  Summary: Avg ${avg_amount:,.2f}, Max ${max_amount:,.2f}, {unique_employees} unique employees")
        
        context_parts.append("")
    
    # Forecast data summary
    if 'forecast_df' in dashboard_data and dashboard_data['forecast_df'] is not None:
        forecast_df = dashboard_data['forecast_df']
        context_parts.append("\n📈 FORECAST DATA:")
        context_parts.append(f"Total forecast records: {len(forecast_df)}")
        context_parts.append("")
    
    context_parts.append("=" * 60)
    context_parts.append("Use the above data to answer specific questions about employees,")
    context_parts.append("hours, expenses, weekly breakdowns, threshold violations, and trends.")
    context_parts.append("=" * 60)
    
    if len(context_parts) <= 10:
        return "No data available in the dashboard. Please upload time and expense data first."
    
    return "\n".join(context_parts)



def initialize_session_state():
    """Initialize Streamlit session state variables."""
    if "bedrock_chatbot" not in st.session_state:
        st.session_state.bedrock_chatbot = None
    if "messages" not in st.session_state:
        st.session_state.messages = []
    if "chatbot_initialized" not in st.session_state:
        st.session_state.chatbot_initialized = False


def render_chatbot_ui(dashboard_data=None):
    """Render the chatbot UI in Streamlit.
    
    Args:
        dashboard_data: Dictionary containing dataframes and summary statistics
                       e.g., {'time_df': df, 'forecast_df': df, 'expense_df': df}
    """
    st.markdown("<h3 style='font-size: 1.2rem;'>🤖 Dashboard Assistant</h3>", unsafe_allow_html=True)
    st.caption("Powered by AWS Bedrock")
    
    # Show data context status with detailed breakdown
    if dashboard_data:
        data_sources = []
        if 'summary_df' in dashboard_data and dashboard_data['summary_df'] is not None:
            data_sources.append("Hours Recon")
        if 'lta_summary' in dashboard_data and dashboard_data['lta_summary'] is not None:
            data_sources.append("LTA")
        if 'expense_compliance' in dashboard_data and dashboard_data['expense_compliance'] is not None:
            data_sources.append("Expense Compliance")
        if 'expense_violations_detail' in dashboard_data and dashboard_data['expense_violations_detail'] is not None and len(dashboard_data['expense_violations_detail']) > 0:
            data_sources.append("Violation Details")
        if 'expense_weekly_summary' in dashboard_data and dashboard_data['expense_weekly_summary'] is not None:
            data_sources.append("Weekly Summary")
        if 'resource_violations' in dashboard_data and dashboard_data['resource_violations']:
            data_sources.append("Billing Violations")
        if 'resource_discrepancies' in dashboard_data and dashboard_data['resource_discrepancies']:
            data_sources.append("Discrepancies")
        
        if data_sources:
            st.caption(f"✅ Connected: {', '.join(data_sources)}")
        else:
            st.caption("⚠️ No dashboard data loaded - only raw data available")
    else:
        st.caption("⚠️ No data connected")
    
    # Initialize session state
    initialize_session_state()
    
    # Sidebar for configuration and controls
    with st.sidebar:
        st.header("Chatbot Settings")
        
        # Initialize chatbot button
        if not st.session_state.chatbot_initialized:
            if st.button("Initialize Chatbot", type="primary"):
                try:
                    with st.spinner("Initializing chatbot..."):
                        st.session_state.bedrock_chatbot = BedrockChatbot()
                        st.session_state.chatbot_initialized = True
                        st.success("Chatbot initialized successfully!")
                        st.rerun()
                except Exception as e:
                    st.error(f"Initialization failed: {str(e)}")
        else:
            st.success(" Chatbot is ready")
            
            # Reset conversation button
            if st.button("Reset Conversation"):
                if st.session_state.bedrock_chatbot:
                    st.session_state.bedrock_chatbot.reset_conversation()
                st.session_state.messages = []
                st.success("Conversation reset!")
                st.rerun()
        
        # Display model info
        # st.divider()
        # st.subheader("Current Configuration")
        # st.text(f"Model: {BEDROCK_MODEL_ID.split("/")[-1]}")
        # st.text(f"Region: {AWS_REGION}")
        # st.text(f"Temperature: {MODEL_KWARGS["temperature"]}")
    
    # Display chat messages
    for message in st.session_state.messages:
        with st.chat_message(message["role"]):
            st.markdown(message["content"])
    
    # Chat input
    if not st.session_state.chatbot_initialized:
        st.info("👆 Please initialize the chatbot using the button in the sidebar.")
    else:
        if prompt := st.chat_input("Ask me anything about your dashboard..."):
            # Add user message to chat history
            st.session_state.messages.append({"role": "user", "content": prompt})
            with st.chat_message("user"):
                st.markdown(prompt)
            
            # Get bot response
            with st.chat_message("assistant"):
                with st.spinner("Thinking..."):
                    # Prepare data context if available
                    data_context = None
                    if dashboard_data:
                        data_context = _format_data_context(dashboard_data)
                    
                    response = st.session_state.bedrock_chatbot.chat(prompt, data_context=data_context)
                    st.markdown(response)
            
            # Add assistant response to chat history
            st.session_state.messages.append({"role": "assistant", "content": response})


def integrate_chatbot_into_dashboard():
    """
    Example function showing how to integrate the chatbot into an existing dashboard.
    Add this to your 7_Dashboard.py file.
    """
    # Add a chat section to your dashboard
    with st.expander(" Dashboard Assistant", expanded=False):
        render_chatbot_ui()


# Main execution
if __name__ == "__main__":
    st.set_page_config(
        page_title="Dashboard Chatbot",
        page_icon="",
        layout="wide"
    )
    render_chatbot_ui()
