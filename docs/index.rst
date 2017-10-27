Launch Vehicle FBM
==================

.. toctree::
   :maxdepth: 2
   :caption: Contents:


Indices and tables
==================

* :ref:`genindex`
* :ref:`modindex`
* :ref:`search`

.. autoclass:: Messenger
   :members:

.. autoclass:: Response
   :members:


Sending responses to the user
-----------------------------

You're given a `reply` function in event emitters. When called, it sends the
first argument, `responseObject`, back to Messenger to the user::

    messenger.on('text', ({ reply, text }) => {
      reply(responseObject)
    })

The classic syntax will also work if you only have one page::

    messenger.on('text', ({ senderId, text }) => {
      messenger.send(senderId, responseObject)
    })

or if you have multiple Pages, you can send responses like::

    messenger.on('text', ({ senderId, text, session }) => {
      const pageId = magic()
      messenger.pageSend(pageId, senderId, responseObject)
    })

Some factories for generating ``responseObject`` are available at the top level
and are also available in a ``responses`` object if you need a namespace::

    const { Text, Image, Generic, ImageQuickReply } = require('launch-vehicle-fbm');
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
