package com.github.vermucht.aggregator.feedback.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.util.StringUtils;

/** Security configuration for feedback admin endpoints. */
@Configuration
public class FeedbackAdminSecurityConfiguration {

  @Bean
  public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
    return http.csrf(AbstractHttpConfigurer::disable)
        .authorizeHttpRequests(
            authorization ->
                authorization
                    .requestMatchers(HttpMethod.POST, "/api/feedback")
                    .permitAll()
                    .requestMatchers(HttpMethod.GET, "/api/admin/feedback")
                    .hasRole("ADMIN")
                    .anyRequest()
                    .permitAll())
        .httpBasic(
            httpBasic -> httpBasic.authenticationEntryPoint(adminApiAuthenticationEntryPoint()))
        .exceptionHandling(
            exceptionHandling ->
                exceptionHandling
                    .authenticationEntryPoint(adminApiAuthenticationEntryPoint())
                    .accessDeniedHandler(
                        (_, response, _) -> response.sendError(HttpStatus.FORBIDDEN.value())))
        .build();
  }

  @Bean
  public AuthenticationEntryPoint adminApiAuthenticationEntryPoint() {
    return new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED);
  }

  @Bean
  public UserDetailsService userDetailsService(
      @Value("${feedback.admin.username}") String username,
      @Value("${feedback.admin.password}") String password) {
    if (!StringUtils.hasText(username) || !StringUtils.hasText(password)) {
      throw new IllegalStateException(
          "Missing feedback admin credentials. Set ADMIN_USERNAME and ADMIN_PASSWORD.");
    }
    return new InMemoryUserDetailsManager(
        User.withUsername(username).password("{noop}" + password).roles("ADMIN").build());
  }
}
