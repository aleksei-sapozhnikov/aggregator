import {
  to = aws_iam_user.aggregator_admin
  id = "aggregator-admin"
}

import {
  to = aws_iam_group.base
  id = "AggregatorBaseAccess"
}

import {
  to = aws_iam_group.demo
  id = "AggregatorDemoAdmins"
}

import {
  to = aws_iam_group.publication
  id = "AggregatorPublicationAdmins"
}

import {
  to = aws_iam_policy.demo_iam_management
  id = "arn:aws:iam::905418096305:policy/AggregatorDemoIAMManagement"
}

import {
  to = aws_iam_policy.demo_ec2_management
  id = "arn:aws:iam::905418096305:policy/AggregatorDemoEC2Management"
}

import {
  to = aws_iam_policy.demo_sg_rule_creation
  id = "arn:aws:iam::905418096305:policy/AggregatorDemoSGRuleCreation"
}

import {
  to = aws_iam_policy.publication_management
  id = "arn:aws:iam::905418096305:policy/AggregatorPublicationManagement"
}

import {
  to = aws_iam_policy.demo_role_boundary
  id = "arn:aws:iam::905418096305:policy/AggregatorDemoRoleBoundary"
}

import {
  to = aws_iam_policy.publication_role_boundary
  id = "arn:aws:iam::905418096305:policy/AggregatorPublicationRoleBoundary"
}

import {
  to = aws_iam_group_policy_attachment.base_readonlyaccess
  id = "AggregatorBaseAccess/arn:aws:iam::aws:policy/ReadOnlyAccess"
}

import {
  to = aws_iam_group_policy_attachment.base_signinlocaldevelopmentaccess
  id = "AggregatorBaseAccess/arn:aws:iam::aws:policy/SignInLocalDevelopmentAccess"
}

import {
  to = aws_iam_group_policy_attachment.demo_demo_ec2_management
  id = "AggregatorDemoAdmins/arn:aws:iam::905418096305:policy/AggregatorDemoEC2Management"
}

import {
  to = aws_iam_group_policy_attachment.demo_demo_iam_management
  id = "AggregatorDemoAdmins/arn:aws:iam::905418096305:policy/AggregatorDemoIAMManagement"
}

import {
  to = aws_iam_group_policy_attachment.demo_demo_sg_rule_creation
  id = "AggregatorDemoAdmins/arn:aws:iam::905418096305:policy/AggregatorDemoSGRuleCreation"
}

import {
  to = aws_iam_group_policy_attachment.publication_publication_management
  id = "AggregatorPublicationAdmins/arn:aws:iam::905418096305:policy/AggregatorPublicationManagement"
}

import {
  to = aws_iam_user_group_membership.aggregator_admin
  id = "aggregator-admin/AggregatorBaseAccess/AggregatorDemoAdmins/AggregatorPublicationAdmins"
}
