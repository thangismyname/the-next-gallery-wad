import numpy as np

from app.providers.embed_stub import StubEmbeddingProvider


def test_encode_texts_matches_single(tiny_png):
    provider = StubEmbeddingProvider()
    texts = ["a dog", "a cat", "a red car"]
    batch = provider.encode_texts(texts)
    assert batch.shape == (3, provider.dimension)
    assert batch.dtype == np.float32
    for row, text in zip(batch, texts):
        np.testing.assert_allclose(row, provider.encode_text(text), rtol=1e-6, atol=1e-7)


def test_encode_images_unit_norm(tiny_png):
    provider = StubEmbeddingProvider()
    batch = provider.encode_images([tiny_png, tiny_png])
    assert batch.shape == (2, provider.dimension)
    np.testing.assert_allclose(np.linalg.norm(batch, axis=1), 1.0, atol=1e-5)
    np.testing.assert_allclose(batch[0], batch[1])
