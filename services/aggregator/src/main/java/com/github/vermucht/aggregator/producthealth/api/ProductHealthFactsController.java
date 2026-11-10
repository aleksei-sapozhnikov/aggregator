package com.github.vermucht.aggregator.producthealth.api;

import com.github.vermucht.aggregator.producthealth.ProductHealthQueryService;
import com.github.vermucht.aggregator.producthealth.model.ItemHealthFact;
import com.github.vermucht.aggregator.producthealth.model.ProductHealthLookup;
import jakarta.annotation.Nonnull;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Read-only deterministic health facts API. */
@RestController
@RequestMapping("/api/product-health")
public class ProductHealthFactsController {
  private final ProductHealthQueryService queryService;

  public ProductHealthFactsController(@Nonnull ProductHealthQueryService queryService) {
    this.queryService = queryService;
  }

  @GetMapping("/items")
  @Nonnull
  public List<ItemHealthFact> listItems(
      @RequestParam(name = "unhealthyOnly", defaultValue = "false") boolean unhealthyOnly) {
    return unhealthyOnly ? queryService.listUnhealthyItems() : queryService.listAllItems();
  }

  @GetMapping("/items/{itemId}")
  @Nonnull
  public ProductHealthLookup getItemById(@PathVariable("itemId") @Nonnull String itemId) {
    return queryService.getItemHealthById(itemId);
  }

  @GetMapping("/search")
  @Nonnull
  public ProductHealthLookup search(@RequestParam("query") @Nonnull String query) {
    return queryService.searchItemHealth(query);
  }

  @GetMapping("/item")
  @Nonnull
  public ProductHealthLookup searchLegacy(@RequestParam("query") @Nonnull String query) {
    return queryService.searchItemHealth(query);
  }
}
