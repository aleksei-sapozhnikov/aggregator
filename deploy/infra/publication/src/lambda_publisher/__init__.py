"""Runtime package for the finite GitHub publication queue.

Its modules load a validated queue snapshot, execute one scheduled step, and
persist progress. Importing the package has no side effects; AWS event handling
starts in ``handler.lambda_handler``.
"""
