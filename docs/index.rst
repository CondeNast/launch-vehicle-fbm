Launch Vehicle FBM
==================

.. toctree::
   :maxdepth: 1

   index
   quickstart

.. autoclass:: Messenger
   :members:

.. autoclass:: Response
   :members:


Sending responses to the user
-----------------------------

You're given a ``reply`` function in event emitters. When called, it sends the
first argument, ``responseMessage``, back to the user::

    messenger.on('text', ({ reply, text }) => {
      reply(responseMessage)
    })

The classic, deprecated syntax will also work if you only have one page::

    messenger.on('text', ({ senderId, text }) => {
      messenger.send(senderId, responseMessage)
    })

The ``reply`` version is preferred because it's more concise and gracefully
handles multiple Pages.

If you have multiple Pages or send messages out of band, use
:func:`Messenger.pageSend`::

    messenger.on('text', ({ senderId, text, session }) => {
      const pageId = magic()
      messenger.pageSend(pageId, senderId, responseMessage)
    })

Some factories for generating ``responseMessage`` are available at the top level
and are also available in a ``responses`` object if you need a namespace::

    const { Text, Image, Generic } = require('launch-vehicle-fbm');
    const { responses } = require('launch-vehicle-fbm');
    // responses.Text, responses.Image, responses.Generic, etc.

The most common response is text::

    new Text('Hello World')

Images just need a url. These also show up in the "Shared Photos" rail.

::

    new Image('https://i.imgur.com/ehSTCkO.gif')

The full list of responses you can make are:

.. autoclass:: Text
   :members:

.. autoclass:: Image
   :members:

.. autoclass:: Generic


* :ref:`genindex`
