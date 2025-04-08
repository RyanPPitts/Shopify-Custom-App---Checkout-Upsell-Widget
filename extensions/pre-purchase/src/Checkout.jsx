import React, { useEffect, useState } from "react";
import {
  reactExtension,
  Divider,
  Image,
  Banner,
  Heading,
  Button,
  InlineLayout,
  BlockStack,
  Text,
  SkeletonText,
  SkeletonImage,
  useCartLines,
  useApplyCartLinesChange,
  useApi,
} from "@shopify/ui-extensions-react/checkout";

// Set up the entry point for the extension
export default reactExtension("purchase.checkout.block.render", () => <App />);

function App() {
  const { query, i18n } = useApi();
  const applyCartLinesChange = useApplyCartLinesChange();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showError, setShowError] = useState(false);
  const lines = useCartLines();

  useEffect(() => {
    if (lines.length) {
      fetchUpsellProductsFromCollections(lines);
    }
  }, [lines]);

  useEffect(() => {
    if (showError) {
      const timer = setTimeout(() => setShowError(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showError]);

  async function handleAddToCart(variantId) {
    setAdding(true);
    const result = await applyCartLinesChange({
      type: "addCartLine",
      merchandiseId: variantId,
      quantity: 1,
    });
    setAdding(false);
    if (result.type === "error") {
      setShowError(true);
      console.error(result.message);
    }
  }

  async function fetchUpsellProductsFromCollections(lines) {
    setLoading(true);
    try {
      const productIds = lines.map((line) => line.merchandise.product.id);
      const { data } = await query(
        `query getCollections($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              collections(first: 5) {
                nodes {
                  handle
                }
              }
            }
          }
        }`,
        { variables: { ids: productIds } }
      );

      const collectionHandles = data.nodes
        .flatMap((product) => product.collections?.nodes || [])
        .map((col) => col.handle);

      const uniqueHandles = [...new Set(collectionHandles)];

      await fetchProductsFromCollections(uniqueHandles, lines);
    } catch (err) {
      console.error("Error fetching collections:", err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchProductsFromCollections(handles, lines) {
    try {
      const queryString = handles.map((handle) => `collection:${handle}`).join(" OR ");
      const { data } = await query(
        `query($query: String!) {
          products(first: 10, query: $query) {
            nodes {
              id
              title
              images(first: 1) {
                nodes {
                  url
                }
              }
              variants(first: 1) {
                nodes {
                  id
                  price {
                    amount
                  }
                }
              }
            }
          }
        }`,
        { variables: { query: queryString } }
      );

      const filtered = getProductsOnOffer(lines, data.products.nodes);
      setProducts(filtered);
    } catch (err) {
      console.error("Error fetching products from collections:", err);
    }
  }

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (!loading && products.length === 0) {
    return null;
  }

  const productsOnOffer = getProductsOnOffer(lines, products);

  if (!productsOnOffer.length) {
    return null;
  }

  return (
    <ProductOfferList
      products={productsOnOffer}
      i18n={i18n}
      adding={adding}
      handleAddToCart={handleAddToCart}
      showError={showError}
    />
  );
}

function LoadingSkeleton() {
  return (
    <BlockStack spacing="loose">
      <Divider />
      <Heading level={2}>You might also like</Heading>
      <BlockStack spacing="loose">
        <InlineLayout spacing="base" columns={[64, "fill", "auto"]} blockAlignment="center">
          <SkeletonImage aspectRatio={1} />
          <BlockStack spacing="none">
            <SkeletonText inlineSize="large" />
            <SkeletonText inlineSize="small" />
          </BlockStack>
          <Button kind="secondary" disabled={true}>
            Add
          </Button>
        </InlineLayout>
      </BlockStack>
    </BlockStack>
  );
}

function getProductsOnOffer(lines, products) {
  const cartLineProductVariantIds = lines.map((item) => item.merchandise.id);
  return products.filter((product) => {
    const isProductVariantInCart = product.variants.nodes.some(({ id }) =>
      cartLineProductVariantIds.includes(id)
    );
    return !isProductVariantInCart;
  });
}

function ProductOfferList({ products, i18n, adding, handleAddToCart, showError }) {
  return (
    <BlockStack spacing="loose">
      <Divider />
      <Heading level={2}>You might also like</Heading>
      <BlockStack spacing="loose">
      {products.slice(0, 3).map((product) => {
          const { id, images, title, variants } = product;
          const renderPrice = i18n.formatCurrency(variants.nodes[0].price.amount);
          const imageUrl =
            images.nodes[0]?.url ??
            "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_medium.png?format=webp&v=1530129081";

          return (
            <InlineLayout
              key={id}
              spacing="base"
              columns={[64, "fill", "auto"]}
              blockAlignment="center"
            >
              <Image
                border="base"
                borderWidth="base"
                borderRadius="loose"
                source={imageUrl}
                accessibilityDescription={title}
                aspectRatio={1}
              />
              <BlockStack spacing="none">
                <Text size="medium" emphasis="bold">
                  {title}
                </Text>
                <Text appearance="subdued">{renderPrice}</Text>
              </BlockStack>
              <Button
                kind="secondary"
                loading={adding}
                accessibilityLabel={`Add ${title} to cart`}
                onPress={() => handleAddToCart(variants.nodes[0].id)}
              >
                Add
              </Button>
            </InlineLayout>
          );
        })}
      </BlockStack>
      {showError && <ErrorBanner />}
    </BlockStack>
  );
}


function ErrorBanner() {
  return (
    <Banner status="critical">
      There was an issue adding this product. Please try again.
    </Banner>
  );
}
